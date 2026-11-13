import { Agent, fetch as undiciFetch, type RequestInit as UndiciRequestInit } from 'undici';

/**
 * One connection pool for everything Stacks fetches.
 *
 * Why not Node's built-in fetch defaults: Node closes idle connections after 4 seconds, so at human
 * browsing pace nearly every click opens a new TLS connection — and from this machine, new handshakes
 * with archive.org intermittently stall for ~18.6 s (measured 2026-11-13; curl never does, Node often).
 * Racing a second connection didn't help: it stalls too. What works is not needing new handshakes:
 * long keep-alive, a warm-up at server start, and a light keep-warm ping while the owner is active.
 * archive.org keeps idle connections ≥ 80 s; Open Library between 50 and 80 s.
 */
const globalForNet = globalThis as unknown as { __stacksAgent?: Agent; __stacksWarm?: NodeJS.Timeout; __stacksLastUse?: number };

export const agent = (globalForNet.__stacksAgent ??= new Agent({
  keepAliveTimeout: 10 * 60_000,
  keepAliveMaxTimeout: 10 * 60_000,
  connections: 8,
}));

export function httpFetch(url: string, init: UndiciRequestInit = {}): Promise<Response> {
  globalForNet.__stacksLastUse = Date.now();
  return undiciFetch(url, { ...init, dispatcher: agent }) as unknown as Promise<Response>;
}

/** Cheap requests that keep one connection per host open. */
const WARM_URLS = [
  'https://archive.org/advancedsearch.php?q=identifier%3Astacks-keepalive&rows=0&output=json',
  'https://openlibrary.org/search.json?q=key%3A%2Fworks%2FOL1W&limit=0&fields=key',
];
const KEEP_WARM_EVERY_MS = 45_000;
const ACTIVE_WINDOW_MS = 15 * 60_000;

function ping(): void {
  for (const url of WARM_URLS) {
    undiciFetch(url, { dispatcher: agent, headers: { 'User-Agent': 'Stacks/0.1 (personal, non-commercial)' } })
      .then((r) => r.arrayBuffer())
      .catch(() => undefined);
  }
}

/** Opens connections at server start, then keeps them warm while Stacks is in use. */
export function startConnectionWarming(): void {
  if (globalForNet.__stacksWarm) return;
  ping();
  globalForNet.__stacksWarm = setInterval(() => {
    const lastUse = globalForNet.__stacksLastUse ?? 0;
    if (Date.now() - lastUse < ACTIVE_WINDOW_MS) ping();
  }, KEEP_WARM_EVERY_MS);
  globalForNet.__stacksWarm.unref();
}
