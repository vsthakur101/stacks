import { z } from 'zod';
import { findLanguage, LANGUAGES } from '@/lib/shared/languages';
import { getJson, TTL } from '../http';
import { looksIndic, toDevanagari } from '../search/variants';

/**
 * Search inside books: archive.org's full-text search (`be-api.us.archive.org/ia-pub-fts-api`,
 * undocumented, used by the official Python client). It indexes the recognised text of scans,
 * Devanagari included, and returns passages with the matched words wrapped in {{{ }}}. Slow: 2–12 s.
 * Page numbers come back only for some books (`page_num`).
 */

const FTS_URL = 'https://be-api.us.archive.org/ia-pub-fts-api';
export const FULLTEXT_PAGE_SIZE = 20;
const MAX_PASSAGES = 3;

export interface PassagePart {
  text: string;
  hit: boolean;
}

export interface FullTextHit {
  identifier: string;
  title: string;
  creator?: string;
  year?: number;
  language?: string;
  downloads?: number;
  /** The page of the best match, when archive.org knows it. */
  page?: number;
  passages: PassagePart[][];
}

export interface FullTextPage {
  total: number;
  page: number;
  hits: FullTextHit[];
  /** The Devanagari form searched alongside a romanised query. */
  alsoSearched?: string;
}

const list = <T extends z.ZodTypeAny>(t: T) => z.array(t).nullish();
const hitSchema = z.object({
  highlight: z.object({ text: z.array(z.string()).optional() }).partial().optional(),
  fields: z.object({
    identifier: z.array(z.string()).min(1),
    meta_title: list(z.string()),
    meta_creator: list(z.string()),
    meta_year: list(z.number()),
    meta_date: list(z.string()),
    meta_languageSorter: list(z.string()),
    meta_downloads: list(z.number()),
    page_num: z.array(z.union([z.number(), z.array(z.number()), z.null()])).nullish(),
  }),
});
const responseSchema = z.object({
  hits: z.object({
    total: z.union([z.number(), z.object({ value: z.number() })]),
    hits: z.array(z.unknown()),
  }),
});

/** "foo {{{bar}}} baz" → parts with the matched words flagged. */
export function parsePassage(raw: string): PassagePart[] {
  const parts: PassagePart[] = [];
  const re = /\{\{\{([\s\S]*?)\}\}\}/g;
  let last = 0;
  for (let m = re.exec(raw); m; m = re.exec(raw)) {
    if (m.index > last) parts.push({ text: raw.slice(last, m.index), hit: false });
    parts.push({ text: m[1]!, hit: true });
    last = m.index + m[0].length;
  }
  if (last < raw.length) parts.push({ text: raw.slice(last), hit: false });
  // Tidy OCR line breaks and runs of spaces; merge neighbours of the same kind.
  const merged: PassagePart[] = [];
  for (const p of parts) {
    const text = p.text.replace(/\s+/g, ' ');
    const prev = merged.at(-1);
    if (prev && prev.hit === p.hit) prev.text += text;
    else merged.push({ text, hit: p.hit });
  }
  return merged;
}

function firstPage(raw: unknown): number | undefined {
  for (const v of Array.isArray(raw) ? raw.flat(2) : []) if (typeof v === 'number' && v > 0) return v;
  return undefined;
}

export function parseFullText(raw: unknown, page: number): Omit<FullTextPage, 'alsoSearched'> {
  const data = responseSchema.parse(raw);
  const total = typeof data.hits.total === 'number' ? data.hits.total : data.hits.total.value;
  const hits: FullTextHit[] = [];
  for (const h of data.hits.hits) {
    const parsed = hitSchema.safeParse(h);
    if (!parsed.success) continue; // one odd record shouldn't sink the page
    const f = parsed.data.fields;
    const year = f.meta_year?.[0] ?? (f.meta_date?.[0] ? Number(f.meta_date[0].slice(0, 4)) || undefined : undefined);
    hits.push({
      identifier: f.identifier[0]!,
      title: f.meta_title?.[0]?.trim() || f.identifier[0]!,
      creator: f.meta_creator?.[0],
      year: year && year > 0 && year < 3000 ? year : undefined,
      language: f.meta_languageSorter?.[0],
      downloads: f.meta_downloads?.[0],
      page: firstPage(f.page_num),
      passages: (parsed.data.highlight?.text ?? []).slice(0, MAX_PASSAGES).map(parsePassage),
    });
  }
  return { total, page, hits };
}

/** Quotes a phrase for the query string; strips characters that would break it. */
function quote(s: string): string {
  return `"${s.replace(/["\\]/g, ' ').trim()}"`;
}

export interface FullTextQuery {
  q: string;
  page?: number;
  /** ISO 639-2 code from our language list. */
  lang?: string;
  /** Match the words in this order, next to each other. */
  phrase?: boolean;
}

/** Builds the query: the text (as a phrase or all words), its Devanagari form for romanised Indic words, texts only, optional language. */
export async function buildFullTextQuery(input: FullTextQuery, transliterate = toDevanagari): Promise<{ query: string; alsoSearched?: string }> {
  const text = input.q.trim().replace(/\s+/g, ' ');
  const words = text.split(' ');
  const term = (s: string) => (input.phrase && s.includes(' ') ? quote(s) : s.includes(' ') ? `(${s.split(' ').map((w) => quote(w)).join(' AND ')})` : quote(s));

  let alsoSearched: string | undefined;
  const romanIndic = words.every((w) => /^[A-Za-z]+$/.test(w)) && words.some((w) => looksIndic(w.toLowerCase()));
  if (romanIndic) {
    const deva = await Promise.all(words.map((w) => transliterate(w.toLowerCase())));
    if (deva.every(Boolean)) alsoSearched = deva.join(' ');
  }
  let query = alsoSearched ? `(${term(text)} OR ${term(alsoSearched)})` : term(text);
  query += ' AND meta_mediatype:texts';
  const lang = findLanguage(input.lang);
  if (lang) query += ` AND meta_languageSorter:(${quote(lang.name)})`;
  else if (input.lang === 'und') query += ` AND NOT meta_languageSorter:(${LANGUAGES.map((l) => quote(l.name)).join(' OR ')})`;
  return { query, alsoSearched };
}

export async function searchFullText(input: FullTextQuery): Promise<FullTextPage> {
  const page = Math.max(1, input.page ?? 1);
  const { query, alsoSearched } = await buildFullTextQuery(input);
  const url = `${FTS_URL}?${new URLSearchParams({ q: query, size: String(FULLTEXT_PAGE_SIZE), from: String((page - 1) * FULLTEXT_PAGE_SIZE) })}`;
  const { data } = await getJson(url, TTL.search, (raw) => parseFullText(raw, page), { timeoutMs: 30_000 });
  return { ...data, ...(alsoSearched ? { alsoSearched } : {}) };
}
