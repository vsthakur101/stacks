import { normalizeQuery, normalizeWithMap, type PageItem } from '@/lib/shared/textMatch';
import { storedPages } from './bookText';

/**
 * "Contents from headings": where chapters start, found from a heading word the reader types
 * (सर्गः, अध्याय, Chapter). Scans often repeat the chapter as a running head on every page
 * ("नवमः सर्गः" atop each page of sarga 9), so a chapter starts on the first page of each run of the
 * same heading (allowing OCR slips). Only lines at the very top of a page, or short lines, count; colophons
 * ("इति … नाम … सर्गः", which close a chapter) don't.
 */

export interface HeadingCandidate {
  page: number;
  /** The heading line as printed (OCR text), trimmed. */
  label: string;
}

/** Running heads sit in the top ~10% of a page; a heading starting mid-page is a short line. */
const TOP = 0.12;
const SHORT_LINE = 40;
const MAX_LABEL = 60;
/** A heading seen this many pages back (same text, allowing OCR slips) is a running head, not a new chapter. */
const RUN_WINDOW = 40;
/** End-of-chapter colophons: "इति … नाम … सर्गः". */
const COLOPHON = /(^|\s)(इति|नाम)(\s|$)/;

interface Line {
  text: string;
  y: number;
}

/** Groups a page's items into lines (items whose tops are within half a line height). */
export function linesOf(text: string, items: readonly PageItem[]): Line[] {
  const lines: { y: number; h: number; parts: { x: number; s: string }[] }[] = [];
  for (const [start, length, x, y, , h] of items) {
    const s = text.slice(start, start + length);
    if (!s.trim()) continue;
    const line = lines.find((l) => Math.abs(l.y - y) < Math.max(l.h, h) * 0.5);
    if (line) line.parts.push({ x, s });
    else lines.push({ y, h, parts: [{ x, s }] });
  }
  return lines
    .sort((a, b) => a.y - b.y)
    .map((l) => ({ y: l.y, text: l.parts.sort((a, b) => a.x - b.x).map((p) => p.s).join(' ').replace(/\s+/g, ' ').trim() }));
}

/** Cleans a heading line for use as a bookmark name: folios, OCR debris, stray marks. */
export function tidy(label: string): string {
  return label
    .replace(/^[\s([{]*[0-9०-९]+[)\]}.]?\s+/, '')
    .replace(/[([{]\s*[0-9०-९<>]*\s*[)\]}]?/g, ' ')
    .replace(/[`'"!|=~$£€¶*<>^ˆ{}]/g, ' ')
    .replace(/\s[0-9०-९]{1,4}(?=\s|$)/g, (m, off: number, all: string) => (/(अ०|अध्याय|chapter)\s*$/i.test(all.slice(0, off)) ? m : ' '))
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}ः।॥]+$/gu, '')
    .slice(0, MAX_LABEL)
    .trim();
}

/**
 * Comparison key: the line without folios. Page numbers come at the start ("५२ गीताकी…") or in
 * brackets ("( १५३ )", often unclosed at the line's end); chapter numbers ("अ० १०") are kept.
 */
export function headingKey(label: string): string {
  const stripped = label
    .replace(/^[\s([{]*[0-9०-९]+[)\]}.]?\s+/, '')
    .replace(/[([{]\s*[0-9०-९<>]+\s*[)\]}]?/g, ' ');
  return normalizeWithMap(stripped).norm;
}

/**
 * What tells one chapter's heading from another's. When a number follows the heading word ("अ० १०",
 * "Chapter 3"), it's that number (compared exactly); otherwise the word before it ("नवमः सर्गः"). The
 * rest of a running head is OCR noise that varies page to page.
 */
export function keyAround(key: string, needle: string): string {
  const at = key.indexOf(needle);
  if (at === -1) return key;
  const number = /^[0-9]{1,3}/.exec(key.slice(at + needle.length))?.[0];
  if (number) return `#${number}`;
  return key.slice(Math.max(0, at - 8), at + needle.length);
}

/** Edit distance, for comparing short heading keys that differ by OCR slips. */
function distance(a: string, b: string): number {
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length]!;
}

/** Numbered keys must match exactly (१० and ११ are different chapters); words may differ by OCR slips. */
const similar = (a: string, b: string) =>
  a.startsWith('#') || b.startsWith('#') ? a === b : distance(a, b) <= Math.max(1, Math.floor(Math.min(a.length, b.length) / 5));

export function findHeadings(pages: { page: number; text: string; items: PageItem[] }[], word: string): HeadingCandidate[] {
  const needle = normalizeQuery(word);
  if (needle.length < 2) return [];
  const runs: { key: string; first: number; last: number; label: string; count: number }[] = [];
  for (const p of pages) {
    const line = linesOf(p.text, p.items).find(
      (l) => (l.y <= TOP || l.text.length <= SHORT_LINE) && !COLOPHON.test(l.text) && normalizeWithMap(l.text).norm.includes(needle),
    );
    if (!line) continue;
    const label = tidy(line.text);
    const key = keyAround(headingKey(label), needle);
    const run = runs.find((r) => p.page - r.last <= RUN_WINDOW && similar(r.key, key));
    if (run) {
      run.last = p.page; // the running head continues
      run.count++;
    } else runs.push({ key, first: p.page, last: p.page, label, count: 1 });
  }
  // A numbered running head repeats; a number seen on one page only is usually an OCR misreading.
  return runs
    .filter((r) => !r.key.startsWith('#') || r.count >= 2)
    .map((r) => ({ page: r.first, label: r.label }))
    .slice(0, 300);
}

export function headingsInBook(file: string, word: string): HeadingCandidate[] {
  const pages = storedPages(file).map((p) => ({ page: p.page, text: p.text, items: JSON.parse(p.itemsJson) as PageItem[] }));
  return findHeadings(pages, word);
}
