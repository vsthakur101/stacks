import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, setDbForTests } from '../db/client';
import { checkSession, newSession, setPassword } from './auth';
import { allowedHost, handle } from './proxy';

let upstream: http.Server;
let door: http.Server;
let doorPort = 0;
const seen: { host?: string; origin?: string; remote?: string; path?: string }[] = [];

beforeEach(async () => {
  setDbForTests(openDb(':memory:'));
  setPassword('correct horse');
  seen.length = 0;
  upstream = http.createServer((req, res) => {
    seen.push({ host: req.headers.host, origin: req.headers.origin, remote: req.headers['x-stacks-remote'] as string, path: req.url });
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('from stacks');
  });
  await new Promise<void>((r) => upstream.listen(0, '127.0.0.1', r));
  const upPort = (upstream.address() as AddressInfo).port;
  door = http.createServer((req, res) => handle(req, res, '127.0.0.1', upPort));
  await new Promise<void>((r) => door.listen(0, '127.0.0.1', r));
  doorPort = (door.address() as AddressInfo).port;
});

afterEach(async () => {
  await new Promise((r) => door.close(r));
  await new Promise((r) => upstream.close(r));
  setDbForTests(undefined);
});

async function call(path: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}) {
  return fetch(`http://127.0.0.1:${doorPort}${path}`, { redirect: 'manual', ...init });
}

describe('phone access door', () => {
  it('sends browsers to sign in and reading apps a Basic challenge', async () => {
    const page = await call('/library', { headers: { Accept: 'text/html' } });
    expect(page.status).toBe(303);
    expect(page.headers.get('location')).toBe('/__stacks/login');
    const app = await call('/opds', { headers: { Accept: 'text/html' } });
    expect(app.status).toBe(401);
    expect(app.headers.get('www-authenticate')).toContain('Basic');
    expect(seen).toHaveLength(0);
  });

  it('signs in with the password and forwards as if from the Mac', async () => {
    const wrong = await call('/__stacks/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=nope' });
    expect(wrong.status).toBe(401);
    const ok = await call('/__stacks/login', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'password=correct+horse' });
    expect(ok.status).toBe(303);
    const cookie = ok.headers.get('set-cookie')!.split(';')[0]!;
    const res = await call('/library', { headers: { cookie } });
    expect(await res.text()).toBe('from stacks');
    expect(seen[0]).toMatchObject({ host: expect.stringMatching(/^127\.0\.0\.1:\d+$/), remote: '1', path: '/library' });
  });

  it('accepts Basic auth (reading apps) and refuses Mac-only actions', async () => {
    const auth = `Basic ${Buffer.from('me:correct horse').toString('base64')}`;
    expect((await call('/opds', { headers: { Authorization: auth } })).status).toBe(200);
    expect((await call('/api/reveal', { method: 'POST', headers: { Authorization: auth } })).status).toBe(403);
  });

  it("rewrites only its own Origin; other sites' requests reach the server marked as cross-site", async () => {
    const cookie = `stacks_remote=${newSession()}`;
    await call('/api/x', { method: 'POST', headers: { cookie, Origin: `http://127.0.0.1:${doorPort}`, 'Content-Type': 'application/json' }, body: '{}' });
    await call('/api/x', { method: 'POST', headers: { cookie, Origin: 'http://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
    expect(seen[0]!.origin).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(seen[1]!.origin).toBe('http://evil.example');
  });

  it('answers only to its address and Tailscale names', () => {
    expect(allowedHost('100.101.1.2:3443', '100.101.1.2')).toBe(true);
    expect(allowedHost('macbook.tail1234.ts.net:3443', '100.101.1.2')).toBe(true);
    expect(allowedHost('macbook:3443', '100.101.1.2')).toBe(true);
    expect(allowedHost('evil.example.com', '100.101.1.2')).toBe(false);
  });

  it('expires sessions and invalidates them when the password changes', () => {
    const token = newSession(Date.now());
    expect(checkSession(token)).toBe(true);
    expect(checkSession(token, Date.now() + 31 * 24 * 60 * 60 * 1000)).toBe(false);
    setPassword('another password');
    expect(checkSession(token)).toBe(false);
  });
});
