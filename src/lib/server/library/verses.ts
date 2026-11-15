import { and, asc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { annotations } from '../db/schema';
import { storedPages } from './bookText';

/**
 * Jump to a verse: Gita Press and similar books close each verse with its number between dandas
 * ("॥ ४७ ॥"). OCR renders the dandas as ॥, ।।, || or | and the digits as Devanagari or ASCII.
 * "47" finds the next verse 47 from the current page; "2.47" looks inside chapter 2, where chapters
 * are the book's bookmarks in page order (Contents from headings makes them).
 */

const DEVA_DIGITS = '०१२३४५६७८९';
const toDeva = (n: number) => String(n).replace(/\d/g, (d) => DEVA_DIGITS[Number(d)]!);
const DANDA = '(?:॥|।।|\\|\\||[।|])';

export function verseMarker(n: number): RegExp {
  return new RegExp(`${DANDA}\\s*(?:${toDeva(n)}|${n})\\s*${DANDA}`, 'u');
}

export interface VerseRef {
  chapter?: number;
  verse: number;
}

/** "47", "४७", "2.47", "२.४७", "2:47" → a reference; null for anything else. */
export function parseVerseRef(input: string): VerseRef | null {
  const s = input.trim().replace(/[०-९]/g, (d) => String(DEVA_DIGITS.indexOf(d)));
  const m = /^(?:(\d{1,3})\s*[.:,/]\s*)?(\d{1,4})$/.exec(s);
  if (!m) return null;
  const verse = Number(m[2]);
  if (!verse) return null;
  return m[1] ? { chapter: Number(m[1]), verse } : { verse };
}

/** First page in [from, to] whose text has the verse's closing marker. */
export function findVerse(pages: { page: number; text: string }[], verse: number, from: number, to = Infinity): number | null {
  const marker = verseMarker(verse);
  return pages.find((p) => p.page >= from && p.page <= to && marker.test(p.text))?.page ?? null;
}

export type VerseResult = { page: number } | { error: string };

export function locateVerse(file: string, ref: VerseRef, currentPage: number): VerseResult {
  const pages = storedPages(file);
  if (!ref.chapter) {
    const page = findVerse(pages, ref.verse, currentPage) ?? findVerse(pages, ref.verse, 1, currentPage - 1);
    return page ? { page } : { error: `No “॥ ${toDeva(ref.verse)} ॥” found in this book’s text.` };
  }
  const starts = getDb()
    .select({ page: annotations.page })
    .from(annotations)
    .where(and(eq(annotations.file, file), eq(annotations.kind, 'bookmark')))
    .orderBy(asc(annotations.page))
    .all()
    .map((r) => r.page);
  if (starts.length < ref.chapter) {
    return { error: `Chapter ${ref.chapter} needs a bookmark at its start (you have ${starts.length}). Use Contents from headings, then try again.` };
  }
  const start = starts[ref.chapter - 1]!;
  const end = (starts[ref.chapter] ?? Infinity) - 1;
  // A chapter's verse often ends on the page where the next chapter's heading starts: allow that page.
  const page = findVerse(pages, ref.verse, start, end + 1);
  return page ? { page } : { error: `No “॥ ${toDeva(ref.verse)} ॥” found in chapter ${ref.chapter} (pages ${start}–${Number.isFinite(end) ? end : 'end'}).` };
}
