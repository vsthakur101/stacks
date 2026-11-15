import { desc, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { languageFilterName } from '@/lib/shared/languages';
import { isSectionId, type ItemCard, type SectionId, type WorkCard } from '@/lib/shared/types';
import { searchArchive, searchSection, searchTexts, sectionQuery, textsQuery } from '../catalog/archive';
import { searchWorks } from '../catalog/openLibrary';
import { ARCHIVE_SECTIONS } from '../catalog/sections';
import { getDb } from '../db/client';
import { savedShelves, searchHistory } from '../db/schema';
import { canonicalParams, parseSearch, SORTS, toQueryString, type RawParams } from './params';
import { expandQuery } from './variants';

/** Paths whose searches can be remembered and pinned. */
export function isShelfPath(path: string): boolean {
  return path === '/books' || path === '/search' || ARCHIVE_SECTIONS.some((s) => path === `/${s}`);
}

function describe(params: Record<string, string[]>): string | undefined {
  const parts: string[] = [];
  const lang = languageFilterName(params.lang?.[0]);
  if (lang) parts.push(lang);
  if (params.source?.[0] === 'archive') parts.push('all scans');
  const sort = params.sort?.[0];
  if (sort && sort in SORTS) parts.push(SORTS[sort as keyof typeof SORTS].label.toLowerCase());
  return parts.length ? parts.join(', ') : undefined;
}

/* ------------------------------ recent searches ------------------------------ */

export function recordSearch(path: string, sp: RawParams): void {
  const params = canonicalParams(sp);
  const q = params.q?.[0];
  if (!q || !isShelfPath(path)) return;
  // One entry per query and place: changing order, language or spellings updates it instead of adding
  // a near-duplicate, and the entry reopens the view used last.
  const key = `${path}|${q.toLocaleLowerCase()}`;
  const now = Date.now();
  const paramsJson = JSON.stringify(params);
  try {
    const db = getDb();
    const existing = db.select().from(searchHistory).where(eq(searchHistory.key, key)).get();
    if (existing) {
      db.update(searchHistory)
        .set({ lastUsedAt: now, uses: existing.uses + 1, paramsJson, label: q })
        .where(eq(searchHistory.key, key))
        .run();
    } else {
      db.insert(searchHistory).values({ key, path, paramsJson, label: q, lastUsedAt: now }).run();
    }
  } catch {
    // Remembering a search must never break the search.
  }
}

export interface RecentSearch {
  href: string;
  label: string;
  detail?: string;
}

export function recentSearches(limit = 8): RecentSearch[] {
  return getDb()
    .select()
    .from(searchHistory)
    .orderBy(desc(searchHistory.lastUsedAt))
    .limit(limit)
    .all()
    .map((row) => {
      const params = JSON.parse(row.paramsJson) as Record<string, string[]>;
      const where = row.path === '/search' ? undefined : row.path.slice(1);
      const detail = [where, describe(params)].filter(Boolean).join(', ');
      return { href: `${row.path}?${toQueryString(params)}`, label: row.label, detail: detail || undefined };
    });
}

export function clearSearchHistory(): void {
  getDb().delete(searchHistory).run();
}

/* ------------------------------ saved shelves ------------------------------ */

export interface SavedShelf {
  id: string;
  title: string;
  href: string;
  path: string;
  params: Record<string, string[]>;
  /** Uploads after this (ms) count as new on the shelf. */
  seenAt: number;
}

export function saveShelf(title: string, path: string, sp: RawParams): string {
  const id = randomUUID();
  getDb()
    .insert(savedShelves)
    .values({ id, title, path, paramsJson: JSON.stringify(canonicalParams(sp)), createdAt: Date.now() })
    .run();
  return id;
}

export function listShelves(): SavedShelf[] {
  return getDb()
    .select()
    .from(savedShelves)
    .orderBy(desc(savedShelves.createdAt))
    .all()
    .map((row) => {
      const params = JSON.parse(row.paramsJson) as Record<string, string[]>;
      return { id: row.id, title: row.title, path: row.path, params, href: `${row.path}?${toQueryString(params)}`, seenAt: row.seenAt ?? row.createdAt };
    });
}

export function markShelfSeen(id: string, at = Date.now()): boolean {
  return getDb().update(savedShelves).set({ seenAt: at }).where(eq(savedShelves.id, id)).run().changes > 0;
}

/** archive.org clause for "added after": no fractional seconds (they make the query malformed). */
export function addedSince(ms: number): string {
  return `addeddate:[${new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')} TO null]`;
}

export interface NewOnShelf {
  count: number;
  results: ItemCard[];
  section: SectionId;
  since: number;
}

/**
 * Watch a search: items added to archive.org since the shelf was last looked at, newest first.
 * Catalogued-book shelves (Open Library) have no upload dates and aren't watched (null).
 */
export async function newOnShelf(shelf: SavedShelf, size = 10): Promise<NewOnShelf | null> {
  const state = parseSearch(shelf.params);
  if (!state.q) return null;
  if (shelf.path === '/books' && shelf.params.source?.[0] !== 'archive') return null;
  const expanded = await expandQuery(state.q, { lang: state.lang, exact: state.exact, excluded: state.excluded });
  const since = ` AND ${addedSince(shelf.seenAt)}`;
  let section: SectionId = 'books';
  let query: string;
  if (shelf.path === '/books' || shelf.path === '/search') query = textsQuery(expanded.lucene, state.lang);
  else {
    const s = shelf.path.slice(1);
    if (!isSectionId(s)) return null;
    section = s;
    query = sectionQuery(s, expanded.lucene, state.lang);
  }
  const page = await searchArchive({ query: query + since, pageSize: size, sort: ['addeddate desc'], ttl: 15 * 60 });
  return { count: page.total, results: page.results, section, since: shelf.seenAt };
}

export function deleteShelf(id: string): boolean {
  return getDb().delete(savedShelves).where(eq(savedShelves.id, id)).run().changes > 0;
}

export type ShelfResults =
  | { kind: 'works'; results: WorkCard[] }
  | { kind: 'items'; section: SectionId; results: ItemCard[] };

/** Re-runs a saved search exactly as it was saved (language, source, sort, spellings) and returns one row. */
export async function runShelf(shelf: SavedShelf, size = 10): Promise<ShelfResults> {
  const state = parseSearch(shelf.params);
  if (!state.q) return { kind: 'items', section: 'books', results: [] };
  const expanded = await expandQuery(state.q, { lang: state.lang, exact: state.exact, excluded: state.excluded });
  const sort = state.sort ? [...SORTS[state.sort].archive] : undefined;

  if (shelf.path === '/books' && shelf.params.source?.[0] !== 'archive') {
    const page = await searchWorks({
      query: expanded.ol,
      pageSize: size,
      includeBorrowable: shelf.params.borrow?.[0] === '1',
      language: state.lang,
    });
    return { kind: 'works', results: page.results };
  }
  if (shelf.path === '/books' || shelf.path === '/search') {
    const page = await searchTexts(expanded.lucene, 1, size, state.lang, sort);
    return { kind: 'items', section: 'books', results: page.results };
  }
  const section = shelf.path.slice(1);
  if (!isSectionId(section)) return { kind: 'items', section: 'books', results: [] };
  const page = await searchSection(section, expanded.lucene, 1, state.lang, sort, size);
  return { kind: 'items', section, results: page.results };
}
