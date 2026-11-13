import fs from 'node:fs/promises';
import path from 'node:path';
import pLimit from 'p-limit';
import { isSafeIdentifier } from './catalog/archive';
import { USER_AGENT } from './http';
import { httpFetch } from './net';

/**
 * Local cover cache. archive.org tells browsers to keep thumbnails for only 5 minutes and each one
 * takes ~1.1 s to fetch; Open Library covers go through two redirects. Covers almost never change, so
 * we keep them on disk and let the browser keep them for 30 days.
 *
 * URLs: /cover/ia/<identifier>   archive.org thumbnail
 *       /cover/ol/<id>-<S|M|L>   Open Library book cover
 *       /cover/ola/<id>-<S|M|L>  Open Library author photo
 */
export type CoverKind = 'ia' | 'ol' | 'ola';

const OL_KEY = /^\d{1,10}-[SML]$/;
/** Re-check a missing cover after a week; refresh a stored one in the background after 90 days. */
const MISSING_RETRY_MS = 7 * 24 * 60 * 60 * 1000;
const REFRESH_AFTER_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_BYTES = 5 * 1024 * 1024;

const globalForCovers = globalThis as unknown as {
  __stacksCoverLimit?: ReturnType<typeof pLimit>;
  __stacksCoverInflight?: Map<string, Promise<Buffer | null>>;
  __stacksCoverFetch?: typeof fetch;
};
const limit = (globalForCovers.__stacksCoverLimit ??= pLimit(6));
const inflight = (globalForCovers.__stacksCoverInflight ??= new Map());

export function setCoverFetchForTests(impl: typeof fetch | undefined): void {
  globalForCovers.__stacksCoverFetch = impl;
}

export function coverDir(): string {
  return process.env.STACKS_COVERS ?? path.join(process.cwd(), 'data', 'covers');
}

/** The upstream URL for a cover key, or null if the key isn't one we serve (no open proxy). */
export function coverSource(kind: string, key: string): string | null {
  if (kind === 'ia' && isSafeIdentifier(key)) return `https://archive.org/services/img/${encodeURIComponent(key)}`;
  // default=false makes Open Library answer 404 for missing covers instead of a blank placeholder.
  if (kind === 'ol' && OL_KEY.test(key)) return `https://covers.openlibrary.org/b/id/${key}.jpg?default=false`;
  if (kind === 'ola' && OL_KEY.test(key)) return `https://covers.openlibrary.org/a/id/${key}.jpg?default=false`;
  return null;
}

/** Image type from the first bytes, so we never trust or store a content-type header. */
export function sniffImageType(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.length >= 6 && buf.subarray(0, 4).toString('ascii') === 'GIF8') return 'image/gif';
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

async function download(url: string): Promise<Buffer | null> {
  const doFetch = globalForCovers.__stacksCoverFetch ?? httpFetch;
  const res = await doFetch(url, { headers: { 'User-Agent': USER_AGENT }, redirect: 'follow', signal: AbortSignal.timeout(20_000) });
  // archive.org redirects missing thumbnails to a generic "not found" image.
  if (res.status === 404 || res.url.includes('/images/notfound')) return null;
  if (!res.ok) throw new Error(`Cover upstream responded ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length === 0 || buf.length > MAX_BYTES || !sniffImageType(buf)) return null;
  return buf;
}

async function fetchAndStore(kind: CoverKind, key: string, url: string): Promise<Buffer | null> {
  const name = `${kind}_${key}`;
  const dir = coverDir();
  const pending = inflight.get(name);
  if (pending) return pending;
  const work = limit(async () => {
    const buf = await download(url);
    await fs.mkdir(dir, { recursive: true });
    if (!buf) {
      await fs.writeFile(path.join(dir, `${name}.missing`), '');
      await fs.rm(path.join(dir, name), { force: true });
      return null;
    }
    const tmp = path.join(dir, `${name}.${process.pid}.tmp`);
    await fs.writeFile(tmp, buf);
    await fs.rename(tmp, path.join(dir, name));
    await fs.rm(path.join(dir, `${name}.missing`), { force: true });
    return buf;
  }).finally(() => inflight.delete(name));
  inflight.set(name, work);
  return work;
}

export type CoverResult = { kind: 'image'; body: Buffer; type: string } | { kind: 'missing' } | { kind: 'invalid' };

/**
 * A cover from disk when we have it (refreshed quietly after 90 days), otherwise fetched once and
 * stored. Missing covers are remembered for a week so the page shows its typographic cover at once.
 */
export async function getCover(kind: string, key: string): Promise<CoverResult> {
  const url = coverSource(kind, key);
  if (!url) return { kind: 'invalid' };
  const name = `${kind}_${key}`;
  const dir = coverDir();
  const now = Date.now();

  try {
    const missing = await fs.stat(path.join(dir, `${name}.missing`));
    if (now - missing.mtimeMs < MISSING_RETRY_MS) return { kind: 'missing' };
  } catch {
    /* not marked missing */
  }

  try {
    const file = path.join(dir, name);
    const [body, stat] = await Promise.all([fs.readFile(file), fs.stat(file)]);
    const type = sniffImageType(body);
    if (type) {
      if (now - stat.mtimeMs > REFRESH_AFTER_MS) void fetchAndStore(kind as CoverKind, key, url).catch(() => undefined);
      return { kind: 'image', body, type };
    }
  } catch {
    /* not stored yet */
  }

  const body = await fetchAndStore(kind as CoverKind, key, url);
  if (!body) return { kind: 'missing' };
  return { kind: 'image', body, type: sniffImageType(body)! };
}
