import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDb, setDbForTests } from './db/client';
import { httpCache } from './db/schema';
import { getJson, setFetchForTests, settled } from './http';

let handle: ReturnType<typeof openDb>;
const network = vi.fn<(url: string) => Promise<Response>>();
const parse = (raw: unknown) => raw as { v: number };

beforeEach(() => {
  handle = openDb(':memory:');
  setDbForTests(handle);
  network.mockReset();
  setFetchForTests(((url: string) => network(url)) as unknown as typeof fetch);
});
afterEach(() => {
  setDbForTests(undefined);
  setFetchForTests(undefined);
});

const json = (v: number) => new Response(JSON.stringify({ v }), { status: 200 });
function seed(url: string, v: number, ageS: number, ttlS: number) {
  handle.db.insert(httpCache).values({ url, status: 200, body: JSON.stringify({ v }), fetchedAt: Date.now() - ageS * 1000, ttlS }).run();
}

describe('getJson caching', () => {
  it('serves a fresh copy without touching the network', async () => {
    seed('https://a.test/x', 1, 10, 60);
    expect(await getJson('https://a.test/x', 60, parse)).toEqual({ data: { v: 1 }, stale: false });
    expect(network).not.toHaveBeenCalled();
  });

  it('serves an expired copy instantly and refreshes it in the background', async () => {
    seed('https://a.test/x', 1, 120, 60);
    network.mockResolvedValue(json(2));
    expect(await getJson('https://a.test/x', 60, parse)).toEqual({ data: { v: 1 }, stale: false });
    await settled();
    expect(network).toHaveBeenCalledTimes(1);
    expect(await getJson('https://a.test/x', 60, parse)).toEqual({ data: { v: 2 }, stale: false });
  });

  it('refreshes each URL once even when asked for it many times at once', async () => {
    seed('https://a.test/x', 1, 120, 60);
    let release: (r: Response) => void = () => {};
    network.mockReturnValue(new Promise((r) => (release = r)));
    await Promise.all([1, 2, 3].map(() => getJson('https://a.test/x', 60, parse)));
    release(json(2));
    await settled();
    expect(network).toHaveBeenCalledTimes(1);
  });

  it('keeps the old copy when a background refresh fails', async () => {
    seed('https://a.test/x', 1, 120, 60);
    network.mockRejectedValue(new Error('offline'));
    await getJson('https://a.test/x', 60, parse);
    await settled();
    const row = handle.db.select().from(httpCache).where(eq(httpCache.url, 'https://a.test/x')).get();
    expect(JSON.parse(row!.body)).toEqual({ v: 1 });
  });

  it('waits for fresh data when the copy is more than a week past its TTL', async () => {
    seed('https://a.test/x', 1, 8 * 24 * 3600, 60);
    network.mockResolvedValue(json(3));
    expect(await getJson('https://a.test/x', 60, parse)).toEqual({ data: { v: 3 }, stale: false });
  });

  it('falls back to any old copy, marked stale, when the network fails', async () => {
    seed('https://a.test/x', 1, 8 * 24 * 3600, 60);
    network.mockRejectedValue(new Error('offline'));
    expect(await getJson('https://a.test/x', 60, parse)).toEqual({ data: { v: 1 }, stale: true });
  });

  it('runs different sites in separate queues', async () => {
    const pending: Array<() => void> = [];
    network.mockImplementation(
      (url) =>
        new Promise((resolve) => {
          if (url.includes('slow.test')) pending.push(() => resolve(json(0)));
          else resolve(json(9));
        }),
    );
    const slow = [1, 2, 3, 4, 5].map((i) => getJson(`https://slow.test/${i}`, 60, parse));
    // Five requests fill slow.test's queue of four; another site must not wait behind them.
    await expect(getJson('https://fast.test/y', 60, parse)).resolves.toEqual({ data: { v: 9 }, stale: false });
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 5));
      pending.shift()?.();
    }
    await Promise.all(slow);
  });
});
