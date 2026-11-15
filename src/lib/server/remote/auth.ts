import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { settings } from '../db/schema';

/**
 * Phone access sign-in. The password is kept only as a scrypt hash; sessions are signed cookies
 * (HMAC with a secret that changes with the password, so a new password signs every device out).
 * Reading apps send the same password with HTTP Basic auth.
 */

const KEY = 'remoteAuth';
export const SESSION_COOKIE = 'stacks_remote';
const SESSION_DAYS = 30;
export const MIN_PASSWORD = 8;

interface Stored {
  salt: string;
  hash: string;
  secret: string;
}

function load(): Stored | null {
  const row = getDb().select().from(settings).where(eq(settings.key, KEY)).get();
  if (!row) return null;
  try {
    return JSON.parse(row.value) as Stored;
  } catch {
    return null;
  }
}

export function hasPassword(): boolean {
  return load() !== null;
}

export function setPassword(password: string): void {
  if (password.length < MIN_PASSWORD) throw new Error(`Use at least ${MIN_PASSWORD} characters.`);
  const salt = randomBytes(16).toString('base64');
  const value: Stored = { salt, hash: scryptSync(password, salt, 32).toString('base64'), secret: randomBytes(32).toString('base64') };
  const json = JSON.stringify(value);
  getDb().insert(settings).values({ key: KEY, value: json }).onConflictDoUpdate({ target: settings.key, set: { value: json } }).run();
}

export function clearPassword(): void {
  getDb().delete(settings).where(eq(settings.key, KEY)).run();
}

export function checkPassword(password: string): boolean {
  const s = load();
  if (!s) return false;
  const given = scryptSync(password, s.salt, 32);
  const want = Buffer.from(s.hash, 'base64');
  return given.length === want.length && timingSafeEqual(given, want);
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** A session token valid for 30 days: "<expiry>.<signature>". */
export function newSession(now = Date.now()): string {
  const s = load();
  if (!s) throw new Error('No password set.');
  const expires = String(now + SESSION_DAYS * 24 * 60 * 60 * 1000);
  return `${expires}.${sign(expires, s.secret)}`;
}

export function checkSession(token: string | undefined, now = Date.now()): boolean {
  const s = load();
  if (!s || !token) return false;
  const [expires, sig] = token.split('.');
  if (!expires || !sig || Number(expires) < now) return false;
  const want = Buffer.from(sign(expires, s.secret));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** "Authorization: Basic …" with any user name and the Stacks password. */
export function checkBasic(header: string | undefined): boolean {
  const m = /^Basic\s+(.+)$/i.exec(header ?? '');
  if (!m) return false;
  const decoded = Buffer.from(m[1]!, 'base64').toString('utf8');
  const i = decoded.indexOf(':');
  return i !== -1 && checkPassword(decoded.slice(i + 1));
}

/** At most 10 wrong passwords per address per 10 minutes. */
const failures = new Map<string, number[]>();
export function allowAttempt(ip: string, now = Date.now()): boolean {
  const recent = (failures.get(ip) ?? []).filter((t) => now - t < 10 * 60_000);
  failures.set(ip, recent);
  return recent.length < 10;
}
export function recordFailure(ip: string, now = Date.now()): void {
  failures.set(ip, [...(failures.get(ip) ?? []), now]);
}
