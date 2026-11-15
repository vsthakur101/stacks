import { execFile, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { promisify } from 'node:util';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { bookTextPages, bookTexts } from '../db/schema';
import { normalizeWithMap, type PageItem } from '@/lib/shared/textMatch';
import { ensureBookText } from './bookText';

const run = promisify(execFile);

/**
 * Better text for poor scans: Apple's Vision text recognition (offline; Hindi/Marathi Devanagari and
 * English), through a small Swift helper compiled on this Mac on first use. Measured on Bhavrog
 * (Geeta Press, no text layer): near-perfect Hindi and Sanskrit, ~0.15 s a page after a one-time
 * warm-up. The recognised text replaces the PDF's own in the book-text store, so Find, Library search,
 * headings, verses and read aloud use it. One book at a time.
 */

const SOURCE = path.join(process.cwd(), 'scripts', 'ocr', 'stacks-ocr.swift');
const BINARY = path.join(process.cwd(), 'data', 'bin', 'stacks-ocr');

export type OcrState =
  | { status: 'idle' }
  | { status: 'queued' | 'running'; done: number; total: number }
  | { status: 'done'; pages: number }
  | { status: 'failed'; message: string };

interface Job {
  absolute: string;
  relative: string;
  state: OcrState;
  child?: ChildProcess;
  cancelled?: boolean;
}

const globalForOcr = globalThis as unknown as { __stacksOcr?: { jobs: Map<string, Job>; running: boolean } };
const queue = (globalForOcr.__stacksOcr ??= { jobs: new Map(), running: false });

const exists = (p: string) => fs.stat(p).then((s) => s, () => null);

/** Text recognition needs macOS and the Swift compiler (Xcode Command Line Tools) or a built helper. */
export async function ocrAvailable(): Promise<boolean> {
  if (process.platform !== 'darwin') return false;
  if (await exists(BINARY)) return true;
  return run('xcrun', ['--find', 'swiftc']).then(() => true, () => false);
}

async function ensureHelper(): Promise<string> {
  const [bin, src] = await Promise.all([exists(BINARY), exists(SOURCE)]);
  if (bin && (!src || bin.mtimeMs >= src.mtimeMs)) return BINARY;
  await fs.mkdir(path.dirname(BINARY), { recursive: true });
  try {
    await run('xcrun', ['swiftc', '-O', SOURCE, '-o', BINARY], { timeout: 5 * 60_000 });
  } catch {
    throw new Error('Text recognition needs Apple’s Command Line Tools: run “xcode-select --install” in Terminal, then try again.');
  }
  return BINARY;
}

interface OcrLine {
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One page's recognised lines → page text and items (one per line), top to bottom. */
export function pageFromLines(lines: OcrLine[]): { text: string; items: PageItem[] } {
  const sorted = [...lines].sort((a, b) => a.y - b.y || a.x - b.x);
  let text = '';
  const items: PageItem[] = [];
  const r = (n: number) => Math.round(n * 10_000) / 10_000;
  for (const l of sorted) {
    const s = l.text.normalize('NFC');
    if (!s.trim()) continue;
    if (text) text += '\n';
    items.push([text.length, s.length, r(l.x), r(l.y), r(l.w), r(l.h)]);
    text += s;
  }
  return { text, items };
}

async function recognise(job: Job): Promise<void> {
  const info = await ensureBookText(job.absolute, job.relative);
  const total = info.pages;
  job.state = { status: 'running', done: 0, total };
  const helper = await ensureHelper();
  const pages = new Map<number, { text: string; items: PageItem[] }>();
  await new Promise<void>((resolve, reject) => {
    const child = spawn(helper, [job.absolute, '1', String(total), 'hi-IN,en-US'], { stdio: ['ignore', 'pipe', 'pipe'] });
    job.child = child;
    let stderr = '';
    child.stderr.on('data', (d) => (stderr += String(d)));
    readline.createInterface({ input: child.stdout }).on('line', (line) => {
      try {
        const { page, lines } = JSON.parse(line) as { page: number; lines: OcrLine[] };
        pages.set(page, pageFromLines(lines));
        job.state = { status: 'running', done: pages.size, total };
      } catch {
        // a malformed line: skip that page
      }
    });
    child.on('error', reject);
    child.on('close', (code) => (job.cancelled ? reject(new Error('Stopped.')) : code === 0 ? resolve() : reject(new Error(stderr.trim() || `Text recognition stopped (code ${code}).`))));
  });

  const lengths = [...pages.values()].map((p) => p.text.length).sort((a, b) => a - b);
  const median = lengths.length ? lengths[Math.floor(lengths.length / 2)]! : 0;
  const db = getDb();
  db.transaction((tx) => {
    tx.delete(bookTextPages).where(eq(bookTextPages.file, job.relative)).run();
    for (const [page, p] of pages) {
      tx.insert(bookTextPages).values({ file: job.relative, page, text: p.text, itemsJson: JSON.stringify(p.items), norm: normalizeWithMap(p.text).norm }).run();
    }
    tx.update(bookTexts)
      .set({ source: 'ocr', chars: lengths.reduce((s, n) => s + n, 0), medianChars: median, extractedAt: Date.now() })
      .where(eq(bookTexts.file, job.relative))
      .run();
  });
  job.state = { status: 'done', pages: pages.size };
}

async function drain(): Promise<void> {
  if (queue.running) return;
  queue.running = true;
  try {
    for (;;) {
      const next = [...queue.jobs.values()].find((j) => j.state.status === 'queued');
      if (!next) break;
      try {
        await recognise(next);
      } catch (error) {
        next.state = { status: 'failed', message: error instanceof Error ? error.message : 'Text recognition failed.' };
      }
    }
  } finally {
    queue.running = false;
  }
}

export function startOcr(absolute: string, relative: string): OcrState {
  const existing = queue.jobs.get(relative);
  if (existing && (existing.state.status === 'queued' || existing.state.status === 'running')) return existing.state;
  const job: Job = { absolute, relative, state: { status: 'queued', done: 0, total: 0 } };
  queue.jobs.set(relative, job);
  void drain();
  return job.state;
}

export function cancelOcr(relative: string): boolean {
  const job = queue.jobs.get(relative);
  if (!job || (job.state.status !== 'queued' && job.state.status !== 'running')) return false;
  job.cancelled = true;
  job.child?.kill();
  if (job.state.status === 'queued') job.state = { status: 'failed', message: 'Stopped.' };
  return true;
}

export function ocrState(relative: string): OcrState {
  return queue.jobs.get(relative)?.state ?? { status: 'idle' };
}

export function textSource(relative: string): 'pdf' | 'ocr' | null {
  const row = getDb().select({ source: bookTexts.source }).from(bookTexts).where(eq(bookTexts.file, relative)).get();
  return row ? (row.source as 'pdf' | 'ocr') : null;
}
