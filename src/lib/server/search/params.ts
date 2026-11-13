import { parseLanguageFilter } from '@/lib/shared/languages';
import type { SearchParams } from '../pageParams';

export type RawParams = Awaited<SearchParams>;

/** archive.org sort per `?sort=`; absent means best match. */
export const SORTS = {
  read: { label: 'Most read', archive: ['downloads desc'] },
  old: { label: 'Oldest', archive: ['date asc'] },
  new: { label: 'Newest', archive: ['date desc'] },
} as const;
export type SortKey = keyof typeof SORTS;

export interface SearchState {
  q?: string;
  lang?: string;
  sort?: SortKey;
  exact: boolean;
  excluded: string[];
  page: number;
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
const all = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []).map((s) => s.trim()).filter(Boolean);

export function parseSearch(sp: RawParams): SearchState {
  const sort = first(sp.sort);
  const page = Number(first(sp.page));
  return {
    q: first(sp.q),
    lang: parseLanguageFilter(first(sp.lang)),
    sort: sort && sort in SORTS ? (sort as SortKey) : undefined,
    exact: first(sp.exact) === '1',
    excluded: all(sp.x).slice(0, 20),
    page: Number.isInteger(page) && page >= 1 ? Math.min(page, 400) : 1,
  };
}

/**
 * A link to `path` with the current params plus `changes`. `undefined` removes a param; arrays repeat it.
 * Paging always resets, since any change of view starts at page 1.
 */
export function hrefWith(path: string, sp: RawParams, changes: Record<string, string | string[] | undefined> = {}): string {
  const out = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) {
    if (k === 'page' || k in changes || v === undefined) continue;
    for (const value of Array.isArray(v) ? v : [v]) out.append(k, value);
  }
  for (const [k, v] of Object.entries(changes)) {
    if (v === undefined) continue;
    for (const value of Array.isArray(v) ? v : [v]) out.append(k, value);
  }
  const s = out.toString();
  return s ? `${path}?${s}` : path;
}

/** The params that define a search (page excluded), as a stable sorted record. */
export function canonicalParams(sp: RawParams): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const k of Object.keys(sp).sort()) {
    if (k === 'page') continue;
    const values = all(sp[k]);
    if (values.length) out[k] = values;
  }
  return out;
}

export function toQueryString(params: Record<string, string[]>): string {
  const out = new URLSearchParams();
  for (const [k, vs] of Object.entries(params)) for (const v of vs) out.append(k, v);
  return out.toString();
}
