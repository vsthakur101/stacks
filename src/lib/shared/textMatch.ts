/**
 * Find in this book: matching that survives OCR. Spaces, punctuation, dandas, nukta and joiners are
 * ignored (OCR breaks and merges words freely), Devanagari digits equal ASCII ones, chandrabindu
 * equals anusvara, Latin is case-insensitive. "Close" matches allow a few wrong, missing or extra
 * letters (Sellers' approximate substring search).
 */

import type { Rect } from './annotations';

const SKIP = /[\s\p{P}\p{S}़ऽ​-‍­﻿]/u;
const DEVANAGARI_DIGIT_ZERO = 0x0966;

export interface Normalized {
  /** Normalised text; one UTF-16 unit per kept character (astral characters are dropped). */
  norm: string;
  /** For each character of `norm`, its offset in the original text. */
  map: number[];
}

export function normalizeWithMap(text: string): Normalized {
  let norm = '';
  const map: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdfff) continue; // surrogate halves: astral symbols, never searched for
    let c = text[i]!;
    if (SKIP.test(c)) continue;
    if (code >= DEVANAGARI_DIGIT_ZERO && code <= DEVANAGARI_DIGIT_ZERO + 9) c = String(code - DEVANAGARI_DIGIT_ZERO);
    else if (c === 'ँ') c = 'ं'; // chandrabindu → anusvara
    else c = c.toLowerCase();
    norm += c;
    map.push(i);
  }
  return { norm, map };
}

export function normalizeQuery(q: string): string {
  return normalizeWithMap(q.normalize('NFC')).norm;
}

/** Errors allowed for a close match of a query this long (in normalised characters). */
export function allowedErrors(length: number): number {
  if (length < 4) return 0;
  if (length <= 7) return 1;
  if (length <= 13) return 2;
  return Math.floor(length / 6);
}

export interface RawMatch {
  /** Offsets in the original text, end exclusive. */
  start: number;
  end: number;
  /** 0 for an exact match. */
  distance: number;
}

/**
 * Matches of `query` (already normalised) in `text`. Exact matches always; close matches when
 * `close` is set. Overlapping candidates keep only the best.
 */
export function findInText(text: string, query: string, close: boolean): RawMatch[] {
  if (!query) return [];
  const { norm, map } = normalizeWithMap(text);
  const out: RawMatch[] = [];
  const toRaw = (s: number, e: number, distance: number): RawMatch => {
    let start = map[s]!;
    let end = map[e - 1]! + 1;
    if (distance > 0) [start, end] = snap(text, start, end);
    return { start, end, distance };
  };

  const k = close ? allowedErrors(query.length) : 0;
  if (k === 0) {
    for (let at = norm.indexOf(query); at !== -1; at = norm.indexOf(query, at + query.length)) out.push(toRaw(at, at + query.length, 0));
    return out;
  }

  // Sellers: column over the query, one step per text character, tracking where each alignment began.
  const m = query.length;
  let cost = new Int32Array(m + 1);
  let from = new Int32Array(m + 1);
  let nextCost = new Int32Array(m + 1);
  let nextFrom = new Int32Array(m + 1);
  for (let i = 0; i <= m; i++) cost[i] = i;
  let run: { start: number; end: number; distance: number } | null = null;
  const flush = () => {
    if (run) out.push(toRaw(run.start, run.end, run.distance));
    run = null;
  };
  for (let j = 1; j <= norm.length; j++) {
    const tc = norm[j - 1];
    nextCost[0] = 0;
    nextFrom[0] = j;
    for (let i = 1; i <= m; i++) {
      let best = cost[i - 1]! + (query[i - 1] === tc ? 0 : 1);
      let start = i === 1 ? j - 1 : from[i - 1]!;
      const up = nextCost[i - 1]! + 1;
      if (up < best) {
        best = up;
        start = nextFrom[i - 1]!;
      }
      const left = cost[i]! + 1;
      if (left < best) {
        best = left;
        start = from[i]!;
      }
      nextCost[i] = best;
      nextFrom[i] = start;
    }
    [cost, nextCost] = [nextCost, cost];
    [from, nextFrom] = [nextFrom, from];
    const d = cost[m]!;
    const s = from[m]!;
    if (d <= k && j > s) {
      // Consecutive candidate ends that overlap describe one place: keep the best of them.
      if (run && s < run.end) {
        // Equally good: prefer the length nearest the query's, then the longer one.
        const len = j - s;
        const runLen = run.end - run.start;
        const nearer = Math.abs(len - m) - Math.abs(runLen - m);
        if (d < run.distance || (d === run.distance && (nearer < 0 || (nearer === 0 && len > runLen)))) run = { start: s, end: j, distance: d };
      } else {
        flush();
        run = { start: s, end: j, distance: d };
      }
    } else if (run && j - 1 >= run.end + m) {
      flush();
    }
  }
  flush();
  return out;
}

/** Devanagari signs that belong to the letter before them (matras, virama, anusvara, visarga…). */
const COMBINING = /[\u0900-\u0903\u093A-\u094F\u0951-\u0957\u0962\u0963]/;

/**
 * A close match ends where the alignment happened to stop, often mid-letter or a letter short of the
 * word's end. Include trailing signs, then reach to word edges up to 2 characters away.
 */
function snap(text: string, start: number, end: number): [number, number] {
  while (end < text.length && COMBINING.test(text[end]!)) end++;
  for (let i = 1; i <= 2 && end + i <= text.length; i++) {
    if (end + i === text.length || /\s/.test(text[end + i]!)) {
      if (!/\s/.test(text.slice(end, end + i))) end += i;
      break;
    }
  }
  for (let i = 1; i <= 2 && start - i >= 0; i++) {
    if (start - i === 0 || /\s/.test(text[start - i - 1]!)) {
      if (!/\s/.test(text.slice(start - i, start))) start -= i;
      break;
    }
  }
  return [start, end];
}

export interface Snippet {
  before: string;
  match: string;
  after: string;
}

export function snippetFor(text: string, start: number, end: number, context = 48): Snippet {
  let a = Math.max(0, start - context);
  let b = Math.min(text.length, end + context);
  // Cut at spaces so words aren't sliced.
  if (a > 0) a = Math.min(start, text.indexOf(' ', a) === -1 ? a : text.indexOf(' ', a) + 1);
  if (b < text.length) b = Math.max(end, text.lastIndexOf(' ', b) === -1 ? b : text.lastIndexOf(' ', b));
  const squash = (s: string) => s.replace(/\s+/g, ' ');
  return {
    before: (a > 0 ? '…' : '') + squash(text.slice(a, start)).trimStart(),
    match: squash(text.slice(start, end)),
    after: squash(text.slice(end, b)).trimEnd() + (b < text.length ? '…' : ''),
  };
}

/** A text item: its offset and length in the page text, and its box as fractions of the page. */
export type PageItem = [start: number, length: number, x: number, y: number, w: number, h: number];

/** Boxes covering text offsets [start, end), cut proportionally inside items. */
export function rectsFor(items: readonly PageItem[], start: number, end: number): Rect[] {
  const rects: Rect[] = [];
  for (const [s, l, x, y, w, h] of items) {
    if (l === 0 || s >= end || s + l <= start) continue;
    const f0 = (Math.max(start, s) - s) / l;
    const f1 = (Math.min(end, s + l) - s) / l;
    rects.push({ x: x + w * f0, y, w: Math.max(w * (f1 - f0), 0.004), h });
  }
  return rects;
}
