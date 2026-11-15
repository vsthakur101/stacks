import http from 'node:http';
import os from 'node:os';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { settings } from '../db/schema';
import { allowAttempt, checkBasic, checkPassword, checkSession, hasPassword, newSession, recordFailure, SESSION_COOKIE } from './auth';

/**
 * Phone access: a second door into Stacks that listens only on this Mac's Tailscale address
 * (100.64.0.0/10, a private network between the owner's own devices) and requires the Stacks password.
 * It forwards to the local-only server, so nothing else listens beyond this Mac. Off by default.
 *
 * Browsers sign in once (signed 30-day cookie); reading apps (OPDS) send the password with Basic auth.
 * Mac-only actions (Open, Show in Finder) are refused remotely.
 */

export const REMOTE_PORT = Number(process.env.STACKS_REMOTE_PORT) || 3443;
const ENABLED_KEY = 'remoteEnabled';
const MAC_ONLY = /^\/api\/(open|reveal)(\/|$)/;

/** This Mac's Tailscale IPv4 address, if Tailscale is running. STACKS_REMOTE_BIND overrides (tests). */
export function tailscaleAddress(): string | null {
  if (process.env.STACKS_REMOTE_BIND) return process.env.STACKS_REMOTE_BIND;
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      const [x, y] = a.address.split('.').map(Number);
      if (x === 100 && y! >= 64 && y! <= 127) return a.address;
    }
  }
  return null;
}

export function remoteEnabled(): boolean {
  return getDb().select().from(settings).where(eq(settings.key, ENABLED_KEY)).get()?.value === 'true';
}

export function setRemoteEnabled(on: boolean): void {
  getDb().insert(settings).values({ key: ENABLED_KEY, value: String(on) }).onConflictDoUpdate({ target: settings.key, set: { value: String(on) } }).run();
}

const cookieOf = (header: string | undefined, name: string) =>
  header
    ?.split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${name}=`))
    ?.slice(name.length + 1);

function loginPage(message = ''): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Sign in | Stacks</title>
<style>body{font:17px/1.5 system-ui,sans-serif;background:#fff;color:#14161f;margin:0;display:grid;place-items:center;min-height:100vh}form{width:min(22rem,90vw)}h1{font-size:1.8rem;margin:0 0 .25rem}p{color:#4a4f63;margin:.25rem 0 1rem}input{width:100%;box-sizing:border-box;font:inherit;padding:.6rem .7rem;border:1px solid #c9ccd8;border-radius:6px}button{margin-top:.8rem;font:inherit;padding:.55rem 1.2rem;border:0;border-radius:999px;background:#2f3be0;color:#fff}.e{color:#b3261e}@media (prefers-color-scheme:dark){body{background:#12141c;color:#eef0f7}p{color:#b6bbcc}input{background:#1b1e29;color:#eef0f7;border-color:#3a3f52}}</style></head>
<body><form method="post" action="/__stacks/login"><h1>Stacks</h1><p>Your reading room, from your phone.</p>
${message ? `<p class="e" role="alert">${message}</p>` : ''}<label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password" autofocus required>
<button type="submit">Sign in</button></form></body></html>`;
}

function send(res: http.ServerResponse, status: number, body: string, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}

async function readForm(req: http.IncomingMessage): Promise<URLSearchParams> {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 10_000) break;
  }
  return new URLSearchParams(body);
}

/** Names this door answers to: its own address, Tailscale's MagicDNS names (defeats DNS rebinding). */
export function allowedHost(host: string | undefined, address: string): boolean {
  const name = (host ?? '').replace(/:\d+$/, '').toLowerCase();
  return name === address || name.endsWith('.ts.net') || /^[a-z0-9-]+$/.test(name);
}

export function handle(req: http.IncomingMessage, res: http.ServerResponse, address: string, upstreamPort = Number(process.env.PORT) || 3000): void {
  const url = new URL(req.url ?? '/', 'http://remote');
  const ip = req.socket.remoteAddress ?? '?';
  if (!allowedHost(req.headers.host, address)) return send(res, 421, 'Wrong address.');

  if (url.pathname === '/__stacks/login') {
    if (req.method !== 'POST') return send(res, 200, loginPage());
    if (!allowAttempt(ip)) return send(res, 429, loginPage('Too many tries. Wait ten minutes.'));
    void readForm(req).then((form) => {
      if (!checkPassword(form.get('password') ?? '')) {
        recordFailure(ip);
        return send(res, 401, loginPage('That password isn’t right.'));
      }
      send(res, 303, '', {
        Location: '/',
        'Set-Cookie': `${SESSION_COOKIE}=${newSession()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 60 * 60}`,
      });
    });
    return;
  }
  if (url.pathname === '/__stacks/logout') {
    return send(res, 303, '', { Location: '/__stacks/login', 'Set-Cookie': `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0` });
  }

  const signedIn = checkSession(cookieOf(req.headers.cookie, SESSION_COOKIE));
  if (!signedIn) {
    const basic = req.headers.authorization;
    if (basic && !allowAttempt(ip)) return send(res, 429, 'Too many tries. Wait ten minutes.');
    if (!checkBasic(basic)) {
      if (basic) recordFailure(ip);
      const wantsPage = (req.headers.accept ?? '').includes('text/html') && !url.pathname.startsWith('/opds');
      if (wantsPage) return send(res, 303, '', { Location: '/__stacks/login' });
      return send(res, 401, 'Sign in required.', { 'WWW-Authenticate': 'Basic realm="Stacks", charset="UTF-8"' });
    }
  }
  if (MAC_ONLY.test(url.pathname)) return send(res, 403, 'Open and Show in Finder only work on the Mac itself.');

  // Forward as if from this Mac: the local server only answers to loopback hosts and same-origin posts.
  const upstream = `127.0.0.1:${upstreamPort}`;
  const headers = { ...req.headers, host: upstream, 'x-forwarded-for': ip, 'x-stacks-remote': '1' };
  // Only Stacks' own pages count as same-origin; any other site's Origin goes through unchanged and the
  // local server refuses it (cross-site request protection).
  if (headers.origin === `http://${req.headers.host}`) headers.origin = `http://${upstream}`;
  if (headers.referer) headers.referer = headers.referer.replace(/^https?:\/\/[^/]+/, `http://${upstream}`);
  delete headers.authorization;
  const forward = http.request({ host: '127.0.0.1', port: upstreamPort, method: req.method, path: req.url, headers }, (up) => {
    const out = { ...up.headers };
    if (typeof out.location === 'string') out.location = out.location.replace(`http://${upstream}`, '');
    res.writeHead(up.statusCode ?? 502, out);
    up.pipe(res);
  });
  forward.on('error', () => !res.headersSent && send(res, 502, 'Stacks isn’t answering on this Mac.'));
  req.pipe(forward);
}

const globalForRemote = globalThis as unknown as { __stacksRemote?: { server: http.Server; address: string } | null; __stacksRemoteTimer?: NodeJS.Timeout };

export interface RemoteStatus {
  enabled: boolean;
  passwordSet: boolean;
  /** Tailscale address found on this Mac. */
  address: string | null;
  /** Listening now, at this URL. */
  url: string | null;
}

export function remoteStatus(): RemoteStatus {
  const running = globalForRemote.__stacksRemote;
  return { enabled: remoteEnabled(), passwordSet: hasPassword(), address: tailscaleAddress(), url: running ? `http://${running.address}:${REMOTE_PORT}` : null };
}

/** Starts or stops the door to match the settings and the Tailscale address. Safe to call often. */
export function syncRemoteAccess(): void {
  const want = remoteEnabled() && hasPassword() ? tailscaleAddress() : null;
  const running = globalForRemote.__stacksRemote;
  if (running && running.address === want) return;
  if (running) {
    running.server.close();
    globalForRemote.__stacksRemote = null;
  }
  if (!want) return;
  const server = http.createServer((req, res) => handle(req, res, want));
  server.on('error', () => {
    globalForRemote.__stacksRemote = null;
  });
  server.listen(REMOTE_PORT, want);
  globalForRemote.__stacksRemote = { server, address: want };
}

/** Checks every minute: Tailscale may come up after Stacks, or the address may change. */
export function startRemoteAccess(): void {
  syncRemoteAccess();
  if (!globalForRemote.__stacksRemoteTimer) globalForRemote.__stacksRemoteTimer = setInterval(syncRemoteAccess, 60_000).unref();
}
