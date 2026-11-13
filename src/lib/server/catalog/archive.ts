import { z } from 'zod';
import { findLanguage } from '@/lib/shared/languages';
import type { ItemCard, Page, SectionId } from '@/lib/shared/types';
import { getJson, TTL, UpstreamError } from '../http';
import { archiveThumb, cleanTitle, first, parseDate, realCollections } from './normalize';
import { SECTIONS, sectionScope } from './sections';

const BASE = 'https://archive.org';
const FIELDS = ['identifier', 'title', 'date', 'year', 'creator', 'publisher', 'mediatype', 'item_count', 'downloads'];

const searchSchema = z.object({
  response: z.object({
    numFound: z.number(),
    docs: z.array(z.record(z.string(), z.unknown())),
  }),
});

export function toItemCard(doc: Record<string, unknown>): ItemCard | null {
  const identifier = first(doc.identifier);
  if (!identifier) return null;
  const date = parseDate(doc.date, doc.year);
  const itemCount = Number(first(doc.item_count));
  const downloads = Number(first(doc.downloads));
  return {
    identifier,
    title: cleanTitle(first(doc.title), identifier),
    isCollection: first(doc.mediatype) === 'collection',
    date: date.iso,
    year: date.year,
    creator: first(doc.creator),
    publisher: first(doc.publisher),
    itemCount: Number.isFinite(itemCount) && itemCount > 0 ? itemCount : undefined,
    downloads: Number.isFinite(downloads) ? downloads : undefined,
    thumbnail: archiveThumb(identifier),
  };
}

export interface ArchiveSearchOptions {
  query: string; // raw Lucene
  page?: number;
  pageSize?: number;
  sort?: string[]; // e.g. ['downloads desc']
  ttl?: number;
}

export async function searchArchive(opts: ArchiveSearchOptions): Promise<Page<ItemCard>> {
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = opts.pageSize ?? 24;
  const params = new URLSearchParams({ q: opts.query, rows: String(pageSize), page: String(page), output: 'json' });
  for (const f of FIELDS) params.append('fl[]', f);
  for (const s of opts.sort ?? []) params.append('sort[]', s);
  const { data, stale } = await getJson(`${BASE}/advancedsearch.php?${params}`, opts.ttl ?? TTL.search, (raw) =>
    searchSchema.parse(raw),
  );
  return {
    total: data.response.numFound,
    page,
    pageSize,
    stale,
    results: data.response.docs.map(toItemCard).filter((c): c is ItemCard => c !== null),
  };
}

export async function countArchive(query: string): Promise<number> {
  const res = await searchArchive({ query, pageSize: 0 });
  return res.total;
}

/** Items (not collections) in a section matching user text. `text` must already be Lucene-escaped. */
export function searchSection(section: SectionId, text: string, page: number, lang?: string): Promise<Page<ItemCard>> {
  return searchArchive({
    query: `(${text}) AND mediatype:texts AND ${sectionScope(section)}${languageClause(lang)}`,
    page,
    sort: [],
  });
}

/** ` AND language:(hin OR Hindi)` for a known language code; empty for none or an unknown code. */
export function languageClause(code: string | undefined): string {
  const lang = findLanguage(code);
  return lang ? ` AND language:(${lang.archiveTerms.map((t) => `"${t}"`).join(' OR ')})` : '';
}

/** Lucene for "every freely downloadable text on archive.org matching user text". `text` must be escaped. */
export function textsQuery(text: string, lang?: string): string {
  return `(${text}) AND mediatype:texts AND NOT collection:(inlibrary OR printdisabled) AND NOT access-restricted-item:true${languageClause(lang)}`;
}

/**
 * All free scans on archive.org, not just those Open Library has catalogued. Many Indic texts
 * (e.g. Geeta Press volumes) exist only here. Relevance order.
 */
export function searchTexts(text: string, page: number, pageSize = 24, lang?: string): Promise<Page<ItemCard>> {
  return searchArchive({ query: textsQuery(text, lang), page, pageSize });
}

/** The browse unit of a section: its publications (child collections), most-used first. */
export async function listPublications(section: SectionId, page: number, text?: string): Promise<Page<ItemCard>> {
  const cfg = SECTIONS[section];
  const scope = cfg.curatedCollections
    ? `identifier:(${cfg.curatedCollections.join(' OR ')})`
    : `collection:(${cfg.roots.join(' OR ')})`;
  return searchArchive({
    query: `mediatype:collection AND ${scope}${text ? ` AND (${text})` : ''}`,
    page,
    sort: ['downloads desc'],
    ttl: text ? TTL.search : TTL.listing,
  });
}

export async function childCollections(collectionId: string, page = 1): Promise<Page<ItemCard>> {
  return searchArchive({
    query: `mediatype:collection AND collection:${quoteId(collectionId)}`,
    page,
    pageSize: 48,
    sort: ['downloads desc'],
    ttl: TTL.listing,
  });
}

/** Earliest and latest dated item in a collection; two cheap rows=1 queries. */
export async function dateSpan(collectionId: string): Promise<{ from?: number; to?: number; total: number }> {
  const base = `mediatype:texts AND collection:${quoteId(collectionId)} AND date:[1000-01-01 TO 2100-12-31]`;
  const [asc, desc, all] = await Promise.all([
    searchArchive({ query: base, pageSize: 1, sort: ['date asc'], ttl: TTL.listing }),
    searchArchive({ query: base, pageSize: 1, sort: ['date desc'], ttl: TTL.listing }),
    searchArchive({ query: `mediatype:texts AND collection:${quoteId(collectionId)}`, pageSize: 0, ttl: TTL.listing }),
  ]);
  return { from: asc.results[0]?.year, to: desc.results[0]?.year, total: all.total };
}

export async function itemsInYear(collectionId: string, year: number): Promise<Page<ItemCard>> {
  return searchArchive({
    query: `mediatype:texts AND collection:${quoteId(collectionId)} AND date:[${year}-01-01 TO ${year}-12-31]`,
    pageSize: 1000,
    sort: ['date asc'],
    ttl: TTL.listing,
  });
}

export async function undatedItems(collectionId: string, page = 1): Promise<Page<ItemCard>> {
  return searchArchive({
    query: `mediatype:texts AND collection:${quoteId(collectionId)} AND NOT date:[* TO *]`,
    page,
    pageSize: 48,
    sort: ['titleSorter asc'],
    ttl: TTL.listing,
  });
}

export async function itemsInCollection(collectionId: string, page = 1): Promise<Page<ItemCard>> {
  return searchArchive({
    query: `mediatype:texts AND collection:${quoteId(collectionId)}`,
    page,
    sort: ['downloads desc'],
    ttl: TTL.listing,
  });
}

/**
 * Of the given scan ids, the most-downloaded readable one that isn't borrow-only.
 * archive.org rejects identifier lists much past ~50 terms, so we ask in batches and keep the best.
 */
export async function bestFreeScan(scanIds: string[]): Promise<string | undefined> {
  const ids = [...new Set(scanIds.filter(isSafeIdentifier))].slice(0, 200);
  const batches: string[][] = [];
  for (let i = 0; i < ids.length; i += BEST_SCAN_BATCH) batches.push(ids.slice(i, i + BEST_SCAN_BATCH));
  const winners = await Promise.all(
    batches.map((batch) =>
      searchArchive({
        query: `identifier:(${batch.map((id) => `"${id}"`).join(' OR ')}) AND mediatype:texts AND NOT collection:(inlibrary OR printdisabled) AND NOT access-restricted-item:true`,
        pageSize: 1,
        sort: ['downloads desc'],
        ttl: TTL.metadata,
      }).then((r) => r.results[0]),
    ),
  );
  return winners
    .filter((w): w is ItemCard => w !== undefined)
    .sort((a, b) => (b.downloads ?? 0) - (a.downloads ?? 0))[0]?.identifier;
}
const BEST_SCAN_BATCH = 40;

/* ---------------------------- item metadata ---------------------------- */

const fileSchema = z.looseObject({
  name: z.string(),
  format: z.string().optional(),
  size: z.union([z.string(), z.number()]).optional(),
  md5: z.string().optional(),
  private: z.union([z.string(), z.boolean()]).optional(),
  source: z.string().optional(),
});
export type ArchiveFile = z.infer<typeof fileSchema>;

const metadataSchema = z.looseObject({
  metadata: z.record(z.string(), z.unknown()).optional(),
  files: z.array(fileSchema).optional(),
  is_dark: z.boolean().optional(),
});

export interface ItemMetadata {
  identifier: string;
  title: string;
  mediatype?: string;
  date?: string;
  year?: number;
  creator?: string;
  publisher?: string;
  language?: string;
  description?: unknown;
  subjects: string[];
  collections: string[];
  restricted: boolean;
  files: ArchiveFile[];
}

export class ItemNotFoundError extends Error {
  constructor(readonly identifier: string) {
    super(`No archive.org item "${identifier}"`);
    this.name = 'ItemNotFoundError';
  }
}

export async function getItem(identifier: string): Promise<ItemMetadata & { stale: boolean }> {
  if (!isSafeIdentifier(identifier)) throw new ItemNotFoundError(identifier);
  const { data, stale } = await getJson(`${BASE}/metadata/${encodeURIComponent(identifier)}`, TTL.metadata, (raw) =>
    metadataSchema.parse(raw),
  );
  if (!data.metadata || data.is_dark) throw new ItemNotFoundError(identifier);
  const m = data.metadata;
  const collections = realCollections(m.collection);
  const date = parseDate(m.date, m.year);
  const restricted =
    first(m['access-restricted-item']) === 'true' ||
    collections.includes('inlibrary') ||
    collections.includes('printdisabled');
  return {
    identifier,
    title: cleanTitle(first(m.title), identifier),
    mediatype: first(m.mediatype),
    date: date.iso,
    year: date.year,
    creator: first(m.creator),
    publisher: first(m.publisher),
    language: first(m.language),
    description: m.description,
    subjects: [m.subject].flat().flatMap((s) => (typeof s === 'string' ? s.split(/;\s*/) : [])).filter(Boolean),
    collections,
    restricted,
    files: data.files ?? [],
    stale,
  };
}

/** archive.org identifiers: letters, digits, `_`, `-`, `.`; we refuse anything else before building URLs/queries. */
export function isSafeIdentifier(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(id);
}

function quoteId(id: string): string {
  if (!isSafeIdentifier(id)) throw new UpstreamError('Invalid collection id', id);
  return `"${id}"`;
}
