import { eq, lt } from 'drizzle-orm';
import pLimit from 'p-limit';
import { getDb } from './db/client';
import { httpCache } from './db/schema';

export const USER_AGENT = 'Stacks/0.1 (personal, non-commercial)';
const API_TIMEOUT_MS = 15_000;

/** All metadata/search calls to archive.org and Open Library share this limiter. */
const globalForHttp = globalThis as unknown as { __stacksApiLimit?: ReturnType<typeof pLimit> };
const apiLimit = (globalForHttp.__stacksApiLimit ??= pLimit(4));

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
  stale: boolean;
}

/**
 * GET a JSON document through the shared limiter and SQLite cache.
 * Fresh cache → returned without a request. Upstream failure with any cached copy → stale copy.
 * `parse` validates/normalizes the raw JSON and throws on shapes we can't use.
 */
export async function getJson<T>(
  url: string,
  ttlS: number,
  parse: (raw: unknown) => T,
  opts: { timeoutMs?: number } = {},
): Promise<CachedJson<T>> {
  const db = getDb();
  const cached = db.select().from(httpCache).where(eq(httpCache.url, url)).get();
  const now = Date.now();
  if (cached && now - cached.fetchedAt < cached.ttlS * 1000) {
    return { data: parse(JSON.parse(cached.body)), stale: false };
  }

  try {
    const body = await apiLimit(async () => {
      const res = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
        signal: AbortSignal.timeout(opts.timeoutMs ?? API_TIMEOUT_MS),
        redirect: 'follow',
        cache: 'no-store',
      });
      if (!res.ok) throw new UpstreamError(`Upstream responded ${res.status}`, url, res.status);
      return res.text();
    });
    const data = parse(JSON.parse(body));
    db.insert(httpCache)
      .values({ url, status: 200, body, fetchedAt: now, ttlS })
      .onConflictDoUpdate({ target: httpCache.url, set: { body, fetchedAt: now, ttlS, status: 200 } })
      .run();
    return { data, stale: false };
  } catch (error) {
    if (cached) return { data: parse(JSON.parse(cached.body)), stale: true };
    if (error instanceof UpstreamError) throw error;
    throw new UpstreamError(error instanceof Error ? error.message : 'Request failed', url);
  }
}

/** Removes cache rows older than 30 days. Called opportunistically at boot. */
export function pruneCache(): void {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
  getDb().delete(httpCache).where(lt(httpCache.fetchedAt, cutoff)).run();
}
