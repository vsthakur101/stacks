import { sql } from 'drizzle-orm';
import { getDb } from '../db/client';
import { toDevanagari } from '../search/variants';
import { getSettings } from '../settings';
import { findInText, normalizeQuery, snippetFor, type Snippet } from '@/lib/shared/textMatch';
import { backfillNorm, ensureBookText, isTextCurrent } from './bookText';
import { scanLibrary, type LibraryFile } from './scan';

/**
 * Search inside every downloaded PDF, offline. Each book's text is extracted once (the same store Find
 * uses) by a quiet background pass; a search is one SQL scan of the normalised page text with instr(),
 * then snippets for the pages that match. Exact matches only: close (OCR-tolerant) matching across a
 * whole library would take seconds; Find inside one book still does it.
 */

/** Bigger files are left out of background indexing (memory); Find still reads them on demand. */
const MAX_INDEX_BYTES = 300 * 1024 * 1024;
const MAX_ROWS = 3000;

export interface IndexStatus {
  /** PDFs in the Library. */
  total: number;
  /** Of those, how many have current text. */
  indexed: number;
  running: boolean;
}

const globalForIndex = globalThis as unknown as { __stacksIndex?: { running: boolean; timer?: NodeJS.Timeout } };
const state = (globalForIndex.__stacksIndex ??= { running: false });

function pdfsIn(scan: Awaited<ReturnType<typeof scanLibrary>>): LibraryFile[] {
  return [...scan.items.flatMap((i) => i.files), ...scan.others].filter((f) => f.ext === 'pdf' && f.size <= MAX_INDEX_BYTES);
}

export async function indexStatus(root = getSettings().downloadRoot): Promise<IndexStatus> {
  const pdfs = pdfsIn(await scanLibrary(root));
  const indexed = pdfs.filter((f) => isTextCurrent(f.relative, f.size, f.modifiedAt)).length;
  return { total: pdfs.length, indexed, running: state.running };
}

/** Extracts text for every PDF that lacks it, one at a time, yielding between books. */
export async function indexLibrary(root = getSettings().downloadRoot): Promise<void> {
  if (state.running) return;
  state.running = true;
  try {
    while (backfillNorm() > 0) await new Promise((r) => setImmediate(r));
    for (const f of pdfsIn(await scanLibrary(root))) {
      if (isTextCurrent(f.relative, f.size, f.modifiedAt)) continue;
      try {
        await ensureBookText(f.path, f.relative);
      } catch {
        // Damaged or encrypted PDF: skip it; Find will say it can't read it.
      }
      await new Promise((r) => setTimeout(r, 50));
    }
  } finally {
    state.running = false;
  }
}

/** Starts the background pass a couple of minutes after boot, then every 30 minutes. */
export function startLibraryIndexing(): void {
  if (state.timer) return;
  const run = () => void indexLibrary().catch(() => undefined);
  setTimeout(run, 2 * 60_000).unref();
  state.timer = setInterval(run, 30 * 60_000).unref();
}

/* ------------------------------------ search ------------------------------------ */

export interface LibraryHit {
  page: number;
  snippet: Snippet;
}

export interface LibraryBookResult {
  file: string;
  /** Matches in this book (pages × occurrences), possibly more than shown. */
  count: number;
  hits: LibraryHit[];
}

export interface LibrarySearchResult {
  searchedFor: string[];
  books: LibraryBookResult[];
  /** Total occurrences across the library. */
  total: number;
  truncated: boolean;
}

/**
 * Roman query → also its Devanagari form. Always tried (not only for words that look Indic): "Raghu" is
 * in the English word list, and an extra exact needle costs nothing and only matches Devanagari text.
 */
async function queryForms(q: string, transliterate: (w: string) => Promise<string | undefined>): Promise<string[]> {
  const text = q.trim().replace(/\s+/g, ' ');
  const words = text.split(' ');
  if (!words.every((w) => /^[A-Za-z]+$/.test(w))) return [text];
  const deva = await Promise.all(words.map((w) => transliterate(w.toLowerCase())));
  return deva.every(Boolean) ? [text, deva.join(' ')] : [text];
}

export async function searchLibrary(
  q: string,
  opts: { files?: ReadonlySet<string>; perBook?: number; transliterate?: (w: string) => Promise<string | undefined> } = {},
): Promise<LibrarySearchResult> {
  const forms = await queryForms(q, opts.transliterate ?? toDevanagari);
  const needles = [...new Set(forms.map(normalizeQuery).filter((n) => n.length >= 2))];
  const perBook = opts.perBook ?? 3;
  if (!needles.length) return { searchedFor: forms, books: [], total: 0, truncated: false };
  // Pages read before normalised text was stored (or by Find since the last pass) get it now.
  while (backfillNorm() > 0);

  const where = sql.join(
    needles.map((n) => sql`instr(norm, ${n}) > 0`),
    sql` OR `,
  );
  const rows = getDb().all<{ file: string; page: number; text: string }>(
    sql`SELECT file, page, text FROM book_text_pages WHERE ${where} ORDER BY file, page LIMIT ${MAX_ROWS}`,
  );

  const byFile = new Map<string, LibraryBookResult>();
  let total = 0;
  for (const row of rows) {
    if (opts.files && !opts.files.has(row.file)) continue; // a book no longer in the folder
    const matches = needles.flatMap((n) => findInText(row.text, n, false));
    if (!matches.length) continue;
    total += matches.length;
    const book = byFile.get(row.file) ?? { file: row.file, count: 0, hits: [] };
    book.count += matches.length;
    for (const m of matches) if (book.hits.length < perBook) book.hits.push({ page: row.page, snippet: snippetFor(row.text, m.start, m.end) });
    byFile.set(row.file, book);
  }
  const books = [...byFile.values()].sort((a, b) => b.count - a.count);
  return { searchedFor: forms, books, total, truncated: rows.length >= MAX_ROWS };
}
