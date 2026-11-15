import { and, asc, eq } from 'drizzle-orm';
import fs from 'node:fs/promises';
import { getDb } from '../db/client';
import { bookPrefs, bookTextPages, bookTexts } from '../db/schema';
import { toDevanagari } from '../search/variants';
import type { Rect } from '@/lib/shared/annotations';
import { findInText, normalizeQuery, rectsFor, snippetFor, type PageItem, type Snippet } from '@/lib/shared/textMatch';

/**
 * Text of downloaded PDFs, extracted once with pdf.js (in Node) and kept in SQLite. Raghuvansham,
 * 332 pages, takes about 0.4 s. Re-extracted when the file's size or modification time changes.
 */

/** Under this median of characters per page the "text" is a watermark or nothing at all. */
const MIN_MEDIAN_CHARS = 200;
const MAX_MATCHES = 300;

export interface BookTextInfo {
  pages: number;
  chars: number;
  /** False for scans whose pages carry almost no recognised text. */
  searchable: boolean;
}

export interface ExtractedPage {
  page: number;
  text: string;
  items: PageItem[];
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;

/** Reads every page's text items and their boxes (fractions of the page). */
export async function extractPdfText(data: Uint8Array): Promise<ExtractedPage[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({ data, verbosity: 0, disableFontFace: true });
  const doc = await task.promise;
  try {
    const out: ExtractedPage[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      let text = '';
      const items: PageItem[] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str) continue;
        const str = item.str.normalize('NFC');
        if (text) text += item.hasEOL ? '\n' : ' ';
        const t = item.transform as number[];
        const [x, y] = vp.convertToViewportPoint(t[4]!, t[5]!) as [number, number];
        const fontH = Math.hypot(t[2]!, t[3]!) || item.height || 10;
        items.push([text.length, str.length, round(x / vp.width), round((y - fontH) / vp.height), round(Math.abs(item.width) / vp.width), round(fontH / vp.height)]);
        text += str;
      }
      out.push({ page: n, text, items });
      page.cleanup();
    }
    return out;
  } finally {
    await task.destroy();
  }
}

const inFlight = new Map<string, Promise<BookTextInfo>>();

function infoFor(file: string, size: number, mtimeMs: number): BookTextInfo | null {
  const row = getDb().select().from(bookTexts).where(eq(bookTexts.file, file)).get();
  if (!row || row.size !== size || row.mtimeMs !== Math.floor(mtimeMs)) return null;
  return { pages: row.pages, chars: row.chars, searchable: row.medianChars >= MIN_MEDIAN_CHARS };
}

/** Makes sure the book's text is extracted and current. `relative` is its path in the download folder. */
export function ensureBookText(absolute: string, relative: string): Promise<BookTextInfo> {
  const running = inFlight.get(relative);
  if (running) return running;
  const job = (async () => {
    const stat = await fs.stat(absolute);
    const known = infoFor(relative, stat.size, stat.mtimeMs);
    if (known) return known;
    const pages = await extractPdfText(new Uint8Array(await fs.readFile(absolute)));
    const lengths = pages.map((p) => p.text.length).sort((a, b) => a - b);
    const median = lengths.length ? lengths[Math.floor(lengths.length / 2)]! : 0;
    const chars = lengths.reduce((s, n) => s + n, 0);
    const db = getDb();
    db.transaction((tx) => {
      tx.delete(bookTextPages).where(eq(bookTextPages.file, relative)).run();
      for (const p of pages) {
        tx.insert(bookTextPages).values({ file: relative, page: p.page, text: p.text, itemsJson: JSON.stringify(p.items) }).run();
      }
      const row = { size: stat.size, mtimeMs: Math.floor(stat.mtimeMs), pages: pages.length, chars, medianChars: median, extractedAt: Date.now() };
      tx.insert(bookTexts).values({ file: relative, ...row }).onConflictDoUpdate({ target: bookTexts.file, set: row }).run();
    });
    return { pages: pages.length, chars, searchable: median >= MIN_MEDIAN_CHARS };
  })().finally(() => inFlight.delete(relative));
  inFlight.set(relative, job);
  return job;
}

export function storedPages(file: string): { page: number; text: string; itemsJson: string }[] {
  return getDb().select({ page: bookTextPages.page, text: bookTextPages.text, itemsJson: bookTextPages.itemsJson }).from(bookTextPages).where(eq(bookTextPages.file, file)).orderBy(asc(bookTextPages.page)).all();
}

/* ------------------------------------ find ------------------------------------ */

export interface BookMatch {
  page: number;
  /** 0 = exact. */
  distance: number;
  snippet: Snippet;
  rects: Rect[];
}

export interface FindResult {
  /** What was searched for: the query, plus its Devanagari form for a romanised query. */
  searchedFor: string[];
  matches: BookMatch[];
  /** More matches exist than were returned. */
  truncated: boolean;
}

const DEVANAGARI = /[ऀ-ॿ]/g;
const LATIN = /[A-Za-z]/g;

/** Whether the book is written mostly in Devanagari (judged from a sample of its pages). */
function mostlyDevanagari(pages: { text: string }[]): boolean {
  let deva = 0;
  let latin = 0;
  for (const p of pages.filter((_, i) => i % 7 === 0)) {
    deva += p.text.match(DEVANAGARI)?.length ?? 0;
    latin += p.text.match(LATIN)?.length ?? 0;
  }
  return deva > latin;
}

/** Searches a book's stored text. Exact matches first (in page order), then close ones. */
export async function findInBook(file: string, q: string, opts: { close?: boolean; transliterate?: (word: string) => Promise<string | undefined> } = {}): Promise<FindResult> {
  const pages = storedPages(file);
  const queries = [q.trim()];
  const romanised = /^[A-Za-z][A-Za-z\s'.-]*$/.test(q.trim());
  if (romanised && mostlyDevanagari(pages)) {
    const toDeva = opts.transliterate ?? toDevanagari;
    const words = await Promise.all(q.trim().toLowerCase().split(/\s+/).map((w) => toDeva(w)));
    if (words.every(Boolean)) queries.push(words.join(' '));
  }
  const normalized = [...new Set(queries.map(normalizeQuery).filter(Boolean))];
  const found: (BookMatch & { start: number })[] = [];
  const seen = new Set<string>();
  let total = 0;
  for (const p of pages) {
    let items: PageItem[] | null = null;
    for (const query of normalized) {
      for (const m of findInText(p.text, query, opts.close ?? true)) {
        const key = `${p.page}:${m.start}`;
        if (seen.has(key)) continue;
        seen.add(key);
        total++;
        if (found.length >= MAX_MATCHES * 2) continue;
        items ??= JSON.parse(p.itemsJson) as PageItem[];
        found.push({ page: p.page, start: m.start, distance: m.distance, snippet: snippetFor(p.text, m.start, m.end), rects: rectsFor(items, m.start, m.end) });
      }
    }
  }
  found.sort((a, b) => Number(a.distance > 0) - Number(b.distance > 0) || a.page - b.page || a.start - b.start);
  return {
    searchedFor: [...new Set(queries)],
    matches: found.slice(0, MAX_MATCHES).map(({ start: _start, ...m }) => m),
    truncated: total > MAX_MATCHES,
  };
}

/* ------------------------------ printed page numbers ------------------------------ */

const PAGE_NUMBER = /^[\[(（{]?\s*([0-9०-९]{1,4})\s*[\])）}]?[.।]?$/;

function toInt(s: string): number {
  return Number([...s].map((c) => (c >= '०' && c <= '९' ? String(c.charCodeAt(0) - 0x0966) : c)).join(''));
}

/**
 * Suggests "PDF page − printed page" from running heads and folios: a lone number among a page's
 * first or last few items. Needs agreement on at least 5 pages and 15% of the book.
 */
export function suggestPageOffset(pages: { page: number; text: string; items: PageItem[] }[]): number | null {
  const votes = new Map<number, number>();
  for (const p of pages) {
    const edge = [...p.items.slice(0, 6), ...p.items.slice(-6)];
    const offsets = new Set<number>();
    for (const [s, l] of edge) {
      const m = PAGE_NUMBER.exec(p.text.slice(s, s + l).trim());
      if (!m) continue;
      const n = toInt(m[1]!);
      if (n >= 1 && n < p.page + 50 && p.page - n >= 0) offsets.add(p.page - n);
    }
    for (const o of offsets) votes.set(o, (votes.get(o) ?? 0) + 1);
  }
  let best: [number, number] | null = null;
  for (const [o, n] of votes) if (!best || n > best[1]) best = [o, n];
  if (!best || best[1] < Math.max(5, pages.length * 0.15)) return null;
  return best[0];
}

export function suggestedOffsetFor(file: string): number | null {
  const pages = storedPages(file).map((p) => ({ page: p.page, text: p.text, items: JSON.parse(p.itemsJson) as PageItem[] }));
  return suggestPageOffset(pages);
}

/* ------------------------------------ prefs ------------------------------------ */

export function getPageOffset(file: string): number | null {
  return getDb().select().from(bookPrefs).where(eq(bookPrefs.file, file)).get()?.pageOffset ?? null;
}

export function setPageOffset(file: string, offset: number | null): void {
  const now = Date.now();
  getDb()
    .insert(bookPrefs)
    .values({ file, pageOffset: offset, updatedAt: now })
    .onConflictDoUpdate({ target: bookPrefs.file, set: { pageOffset: offset, updatedAt: now } })
    .run();
}

export function hasStoredText(file: string): boolean {
  return Boolean(getDb().select({ file: bookTexts.file }).from(bookTexts).where(and(eq(bookTexts.file, file))).get());
}
