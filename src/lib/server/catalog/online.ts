import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { getCached, TTL, USER_AGENT } from '../http';
import { httpFetch } from '../net';

/**
 * Online page reader: a scan's pages from archive.org's IIIF service, cached on disk. archive.org
 * answers in ~3 s a page (measured 2026-11-15), so the next pages are fetched ahead and every page
 * seen once opens instantly afterwards.
 */

export interface OnlinePage {
  n: number;
  label?: string;
  width: number;
  height: number;
  /** IIIF image service base. */
  service: string;
}

export const PAGE_WIDTHS = [800, 1200, 1600, 2000] as const;
const CACHE_DIR = () => path.join(process.env.STACKS_PAGES ?? path.join(process.cwd(), 'data', 'pages'));
const CACHE_LIMIT = 1024 * 1024 * 1024; // 1 GB of page images

const label = z.union([z.record(z.string(), z.array(z.string())), z.string()]).optional();
const manifestSchema = z.object({
  items: z.array(
    z.object({
      label,
      width: z.number().optional(),
      height: z.number().optional(),
      items: z.array(z.object({ items: z.array(z.object({ body: z.object({ service: z.array(z.object({ id: z.string().optional(), '@id': z.string().optional() })).optional() }) })) })),
    }),
  ),
});

export function parseManifest(raw: unknown): OnlinePage[] {
  return manifestSchema
    .parse(raw)
    .items.map((c, i): OnlinePage | null => {
      const svc = c.items[0]?.items[0]?.body.service?.[0];
      const service = svc?.id ?? svc?.['@id'];
      if (!service || !service.startsWith('https://iiif.archive.org/')) return null;
      const l = typeof c.label === 'string' ? c.label : c.label ? Object.values(c.label)[0]?.[0] : undefined;
      return { n: i + 1, label: l, width: c.width ?? 1000, height: c.height ?? 1400, service };
    })
    .filter((p): p is OnlinePage => p !== null)
    .map((p, i) => ({ ...p, n: i + 1 }));
}

export async function onlinePages(identifier: string): Promise<OnlinePage[]> {
  const url = `https://iiif.archive.org/iiif/3/${encodeURIComponent(identifier)}/manifest.json`;
  // Accept: */* — asking IIIF for application/json makes it take ~20 s instead of ~2.5 s (measured).
  return (await getCached(url, TTL.listing, (body) => parseManifest(JSON.parse(body)), { timeoutMs: 30_000, accept: '*/*' })).data;
}

const inFlight = new Map<string, Promise<Buffer>>();

function cachePath(identifier: string, n: number, width: number): string {
  return path.join(CACHE_DIR(), identifier, `${n}-${width}.jpg`);
}

/** A page image at a width, from the disk cache or archive.org (one fetch per page at a time). */
export async function pageImage(identifier: string, page: OnlinePage, width: number): Promise<Buffer> {
  const file = cachePath(identifier, page.n, width);
  const cached = await fs.readFile(file).catch(() => null);
  if (cached) {
    void fs.utimes(file, new Date(), new Date()).catch(() => undefined); // recently used
    return cached;
  }
  const key = `${identifier}/${page.n}/${width}`;
  const running = inFlight.get(key);
  if (running) return running;
  const job = (async () => {
    // IIIF 3 refuses to enlarge (400): never ask for more than the page's own width.
    const w = Math.min(width, page.width);
    const res = await httpFetch(`${page.service}/full/${w},/0/default.jpg`, { headers: { 'User-Agent': USER_AGENT, Accept: '*/*' }, signal: AbortSignal.timeout(35_000) });
    if (!res.ok) throw new Error(`archive.org answered ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, buf);
    void pruneCache().catch(() => undefined);
    return buf;
  })().finally(() => inFlight.delete(key));
  inFlight.set(key, job);
  return job;
}

let lastPrune = 0;
/** Keeps the page cache under 1 GB, dropping the least recently used images. At most once a minute. */
export async function pruneCache(limit = CACHE_LIMIT, now = Date.now()): Promise<void> {
  if (now - lastPrune < 60_000 && limit === CACHE_LIMIT) return;
  lastPrune = now;
  const root = CACHE_DIR();
  const files: { p: string; size: number; at: number }[] = [];
  for (const dir of await fs.readdir(root).catch(() => [])) {
    for (const f of await fs.readdir(path.join(root, dir)).catch(() => [])) {
      const p = path.join(root, dir, f);
      const s = await fs.stat(p).catch(() => null);
      if (s) files.push({ p, size: s.size, at: s.mtimeMs });
    }
  }
  let total = files.reduce((n, f) => n + f.size, 0);
  for (const f of files.sort((a, b) => a.at - b.at)) {
    if (total <= limit) break;
    await fs.rm(f.p, { force: true });
    total -= f.size;
  }
}
