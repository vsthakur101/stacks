import { eq, lt } from 'drizzle-orm';
import pLimit from 'p-limit';
import { getDb } from './db/client';
import { httpCache } from './db/schema';
import { httpFetch } from './net';

export const USER_AGENT = 'Stacks/0.1 (personal, non-commercial)';
const API_TIMEOUT_MS = 15_000;
const PER_HOST_CONCURRENCY = 4;
/** How long past its TTL a cached copy may still be shown instantly while a fresh one loads behind it. */
const MAX_STALE_MS = 7 * 24 * 60 * 60 * 1000;

export const TTL = {
  search: 60 * 60,
  metadata: 24 * 60 * 60,
  listing: 7 * 24 * 60 * 60,
  transliteration: 30 * 24 * 60 * 60,
} as const;

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly url: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

export interface CachedJson<T> {
  data: T;
  /** True when served from cache because the upstream was unreachable. */
  stale: boolean;
}

/* ------------------------------ per-host queues ------------------------------ */

const globalForHttp = globalThis as unknown as {
  __stacksHostLimits?: Map<string, ReturnType<typeof pLimit>>;
  __stacksRevalidating?: Set<string>;
  __stacksFetchForTests?: typeof fetch;
};
const hostLimits = (globalForHttp.__stacksHostLimits ??= new Map());
const revalidating = (globalForHttp.__stacksRevalidating ??= new Set<string>());

/**
 * Each site gets its own queue of 4 concurrent requests, so a burst to archive.org (global search
 * fans out to 5 queries) never holds up Open Library or the transliteration lookup.
 */
function limitFor(url: string): ReturnType<typeof pLimit> {
  const host = new URL(url).host;
  let limit = hostLimits.get(host);
  if (!limit) {
    limit = pLimit(PER_HOST_CONCURRENCY);
    hostLimits.set(host, limit);
  }
  return limit;
}

/** Test hook: replace the network. */
export function setFetchForTests(impl: typeof fetch | undefined): void {
  globalForHttp.__stacksFetchForTests = impl;
}

async function download(url: string, timeoutMs: number): Promise<string> {
  return limitFor(url)(async () => {
    const doFetch = globalForHttp.__stacksFetchForTests ?? httpFetch;
    const res = await doFetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(timeoutMs),
      redirect: 'follow',
    });
    if (!res.ok) throw new UpstreamError(`Upstream responded ${res.status}`, url, res.status);
    return res.text();
  });
}

function store(url: string, body: string, ttlS: number): void {
  const now = Date.now();
  getDb()
    .insert(httpCache)
    .values({ url, status: 200, body, fetchedAt: now, ttlS })
    .onConflictDoUpdate({ target: httpCache.url, set: { body, fetchedAt: now, ttlS, status: 200 } })
    .run();
}

/** Refreshes a cached URL without anyone waiting on it. One refresh per URL at a time. */
function revalidate<T>(url: string, ttlS: number, parse: (raw: unknown) => T, timeoutMs: number): void {
  if (revalidating.has(url)) return;
  revalidating.add(url);
  download(url, timeoutMs)
    .then((body) => {
      parse(JSON.parse(body)); // only cache shapes we can use
      store(url, body, ttlS);
    })
    .catch(() => undefined) // the old copy stays; we'll try again next time it's asked for
    .finally(() => revalidating.delete(url));
}

/**
 * GET a JSON document through a per-host queue and the SQLite cache.
 * - Fresh copy: returned, no request.
 * - Expired but under a week past its TTL: returned instantly, refreshed in the background.
 * - No copy, or a very old one: fetched now; if that fails, any old copy is served marked `stale`.
 * `parse` validates/normalizes the raw JSON and throws on shapes we can't use.
 */
export async function getJson<T>(
  url: string,
  ttlS: number,
  parse: (raw: unknown) => T,
  opts: { timeoutMs?: number } = {},
): Promise<CachedJson<T>> {
  const timeoutMs = opts.timeoutMs ?? API_TIMEOUT_MS;
  const cached = getDb().select().from(httpCache).where(eq(httpCache.url, url)).get();
  const age = cached ? Date.now() - cached.fetchedAt : Infinity;

  if (cached && age < cached.ttlS * 1000) {
    return { data: parse(JSON.parse(cached.body)), stale: false };
  }
  if (cached && age < cached.ttlS * 1000 + MAX_STALE_MS) {
    try {
      const data = parse(JSON.parse(cached.body));
      revalidate(url, ttlS, parse, timeoutMs);
      return { data, stale: false };
    } catch {
      // Unusable old copy: fall through and fetch.
    }
  }

  try {
    const body = await download(url, timeoutMs);
    const data = parse(JSON.parse(body));
    store(url, body, ttlS);
    return { data, stale: false };
  } catch (error) {
    if (cached) return { data: parse(JSON.parse(cached.body)), stale: true };
    if (error instanceof UpstreamError) throw error;
    throw new UpstreamError(error instanceof Error ? error.message : 'Request failed', url);
  }
}

/** Resolves when background refreshes have finished. Test helper. */
export async function settled(): Promise<void> {
  while (revalidating.size > 0) await new Promise((r) => setTimeout(r, 5));
}

/** Removes cache rows older than 30 days. Called opportunistically at boot. */
export function pruneCache(): void {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  getDb().delete(httpCache).where(lt(httpCache.fetchedAt, cutoff)).run();
}
