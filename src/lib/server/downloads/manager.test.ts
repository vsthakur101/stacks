import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { TrayItem } from '@/lib/shared/types';
import { ItemNotFoundError, type ItemMetadata } from '../catalog/archive';
import { openDb } from '../db/client';
import { DownloadManager } from './manager';

/* ---------- a tiny archive.org stand-in: Range support, scripted failures ---------- */

const CONTENT = new Map<string, Buffer>();
const failures = new Map<string, number[]>(); // path → statuses to return first
let requests: { path: string; range?: string }[] = [];

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url ?? '');
  requests.push({ path: p, range: req.headers.range });
  const queued = failures.get(p);
  if (queued && queued.length > 0) {
    res.writeHead(queued.shift()!);
    return res.end();
  }
  const body = CONTENT.get(p);
  if (!body) {
    res.writeHead(404);
    return res.end();
  }
  const m = req.headers.range?.match(/bytes=(\d+)-/);
  if (m) {
    const start = Number(m[1]);
    res.writeHead(206, { 'Content-Length': body.length - start, 'Content-Range': `bytes ${start}-${body.length - 1}/${body.length}` });
    return res.end(body.subarray(start));
  }
  res.writeHead(200, { 'Content-Length': body.length });
  res.end(body);
});
let baseUrl = '';

beforeAll(async () => {
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

/* ---------- fixtures ---------- */

function bytes(n: number, seed = 1): Buffer {
  const b = Buffer.alloc(n);
  for (let i = 0; i < n; i++) b[i] = (i * 31 + seed) % 251;
  return b;
}
const md5 = (b: Buffer) => createHash('md5').update(b).digest('hex');

function addItem(id: string, files: { name: string; format: string; body: Buffer; private?: boolean; badMd5?: boolean }[], extra: Partial<ItemMetadata> = {}) {
  for (const f of files) CONTENT.set(`/${id}/${f.name}`, f.body);
  items.set(id, {
    identifier: id,
    title: `Title ${id}`,
    subjects: [],
    collections: [],
    restricted: false,
    year: 1900,
    files: files.map((f) => ({
      name: f.name,
      format: f.format,
      size: String(f.body.length),
      md5: f.badMd5 ? '0'.repeat(32) : md5(f.body),
      ...(f.private ? { private: 'true' } : {}),
    })),
    ...extra,
  });
}
const items = new Map<string, ItemMetadata>();
const tray = (id: string, extra: Partial<TrayItem> = {}): TrayItem => ({ identifier: id, title: `Title ${id}`, section: 'books', ...extra });

let root: string;
let manager: DownloadManager;
let concurrency = 3;

function makeManager() {
  const { db } = openDb(':memory:');
  return new DownloadManager({
    db,
    root: () => root,
    concurrency: () => concurrency,
    getItem: async (id) => {
      const item = items.get(id);
      if (!item) throw new ItemNotFoundError(id);
      return item;
    },
    fileUrl: (id, name) => `${baseUrl}/${id}/${name}`,
    backoffMs: () => 5,
  });
}

beforeEach(async () => {
  root = await fsp.mkdtemp(path.join(os.tmpdir(), 'stacks-test-'));
  CONTENT.clear();
  items.clear();
  failures.clear();
  requests = [];
  concurrency = 3;
  manager = makeManager();
  manager.init();
});
afterEach(async () => {
  await fsp.rm(root, { recursive: true, force: true });
});

const tasksOf = (jobId: string) => manager.getJob(jobId)!.tasks;

/* ---------- tests ---------- */

describe('DownloadManager', () => {
  it('downloads, verifies and names files per the design', async () => {
    const body = bytes(50_000);
    addItem('pp', [{ name: 'pp.pdf', format: 'Text PDF', body }]);
    const job = manager.createJob([tray('pp', { year: 1813, title: 'Pride and Prejudice' })], 'pdf', 'skip');
    await manager.idle();

    const [task] = tasksOf(job);
    expect(task?.state).toBe('done');
    const dest = path.join(root, 'Books', 'Pride and Prejudice (1813) [pp].pdf');
    expect(task?.destPath).toBe(dest);
    expect(md5(await fsp.readFile(dest))).toBe(md5(body));
    expect(fs.existsSync(`${dest}.part`)).toBe(false);
  });

  it('resumes from a partial file with a Range request', async () => {
    const body = bytes(80_000);
    addItem('res', [{ name: 'res.pdf', format: 'Text PDF', body }]);
    const dest = path.join(root, 'Books', 'Title res (1900) [res].pdf');
    await fsp.mkdir(path.dirname(dest), { recursive: true });
    await fsp.writeFile(`${dest}.part`, body.subarray(0, 30_000));

    const job = manager.createJob([tray('res')], 'pdf', 'skip');
    await manager.idle();

    expect(tasksOf(job)[0]?.state).toBe('done');
    expect(requests.find((r) => r.path === '/res/res.pdf')?.range).toBe('bytes=30000-');
    expect(md5(await fsp.readFile(dest))).toBe(md5(body));
  });

  it('skips files it already has without any transfer', async () => {
    const body = bytes(1000);
    addItem('have', [{ name: 'have.pdf', format: 'Text PDF', body }]);
    const first = manager.createJob([tray('have')], 'pdf', 'skip');
    await manager.idle();
    requests = [];
    const second = manager.createJob([tray('have')], 'pdf', 'skip');
    await manager.idle();

    expect(tasksOf(first)[0]?.state).toBe('done');
    expect(tasksOf(second)[0]).toMatchObject({ state: 'done', note: 'Already had it' });
    expect(requests).toHaveLength(0);
  });

  it('skips borrow-only and missing items, applies the format fallback', async () => {
    addItem('locked', [{ name: 'l.pdf', format: 'Text PDF', body: bytes(10), private: true }], { restricted: true });
    addItem('txtonly', [{ name: 't_djvu.txt', format: 'DjVuTXT', body: bytes(10) }]);
    addItem('nothing', [{ name: 'n_djvu.txt', format: 'DjVuTXT', body: bytes(10) }]);

    const job = manager.createJob([tray('locked'), tray('txtonly'), tray('ghost')], 'epub', 'text');
    const job2 = manager.createJob([tray('nothing')], 'epub', 'skip');
    await manager.idle();

    const byId = Object.fromEntries(tasksOf(job).map((t) => [t.identifier, t]));
    expect(byId.locked).toMatchObject({ state: 'skipped', note: 'Borrow-only — not downloadable' });
    expect(byId.txtonly).toMatchObject({ state: 'done', note: 'Used Plain text (no EPUB)' });
    expect(byId.ghost).toMatchObject({ state: 'skipped', note: 'Not found on archive.org' });
    expect(tasksOf(job2)[0]).toMatchObject({ state: 'skipped', note: 'No EPUB available' });
  });

  it('expands multi-file items into one task per file inside a folder', async () => {
    addItem('multi', [
      { name: 'v1.pdf', format: 'Text PDF', body: bytes(100, 1) },
      { name: 'v2.pdf', format: 'Text PDF', body: bytes(100, 2) },
    ]);
    const job = manager.createJob([tray('multi')], 'pdf', 'skip');
    await manager.idle();

    const tasks = tasksOf(job);
    expect(tasks.map((t) => t.state)).toEqual(['done', 'done']);
    expect(tasks.map((t) => path.relative(root, t.destPath!))).toEqual([
      'Books/Title multi (1900) [multi]/v1.pdf',
      'Books/Title multi (1900) [multi]/v2.pdf',
    ]);
  });

  it('retries transient errors and fails fast on 403', async () => {
    addItem('flaky', [{ name: 'f.pdf', format: 'Text PDF', body: bytes(500) }]);
    addItem('denied', [{ name: 'd.pdf', format: 'Text PDF', body: bytes(500) }]);
    failures.set('/flaky/f.pdf', [503, 429]);
    failures.set('/denied/d.pdf', [403]);

    const job = manager.createJob([tray('flaky'), tray('denied')], 'pdf', 'skip');
    await manager.idle();

    const byId = Object.fromEntries(tasksOf(job).map((t) => [t.identifier, t]));
    expect(byId.flaky).toMatchObject({ state: 'done', attempts: 3 });
    expect(byId.denied).toMatchObject({ state: 'failed', note: 'Access denied by archive.org' });
  });

  it('fails a file whose checksum never matches, leaving no partial behind', async () => {
    addItem('bad', [{ name: 'b.pdf', format: 'Text PDF', body: bytes(500), badMd5: true }]);
    const job = manager.createJob([tray('bad')], 'pdf', 'skip');
    await manager.idle();

    const [task] = tasksOf(job);
    expect(task?.state).toBe('failed');
    expect(task?.note).toMatch(/checksum mismatch/);
    expect(fs.existsSync(task!.destPath!)).toBe(false);
  });

  it('cancels queued work and can retry it', async () => {
    concurrency = 0; // nothing starts
    addItem('c1', [{ name: 'c1.pdf', format: 'Text PDF', body: bytes(100) }]);
    const job = manager.createJob([tray('c1')], 'pdf', 'skip');
    manager.cancelJob(job);
    expect(tasksOf(job)[0]?.state).toBe('cancelled');

    concurrency = 3;
    manager.retryJob(job);
    await manager.idle();
    expect(tasksOf(job)[0]?.state).toBe('done');
  });

  it('re-queues interrupted tasks on restart', async () => {
    const body = bytes(2000);
    addItem('boot', [{ name: 'boot.pdf', format: 'Text PDF', body }]);
    const { db, sqlite } = openDb(':memory:');
    const m1 = new DownloadManager({ db, root: () => root, concurrency: () => 0, getItem: async (id) => items.get(id)!, fileUrl: (id, n) => `${baseUrl}/${id}/${n}` });
    const job = m1.createJob([tray('boot')], 'pdf', 'skip');
    sqlite.prepare(`UPDATE download_tasks SET state = 'downloading'`).run();

    const m2 = new DownloadManager({ db, root: () => root, concurrency: () => 3, getItem: async (id) => items.get(id)!, fileUrl: (id, n) => `${baseUrl}/${id}/${n}` });
    m2.init();
    await m2.idle();
    expect(m2.getJob(job)?.tasks[0]?.state).toBe('done');
  });
});

describe('download window and bandwidth cap', () => {
  it('waits outside the window, runs when it opens, and puts stopped downloads back in the queue', async () => {
    let open = false;
    const slow = new Map<string, number>();
    const { db } = openDb(':memory:');
    const m = new DownloadManager({
      db,
      root: () => root,
      concurrency: () => 3,
      getItem: async (id) => items.get(id)!,
      fileUrl: (id, name) => `${baseUrl}/${id}/${name}`,
      backoffMs: () => 5,
      window: () => ({ open, text: 'Downloads run between 23:00 and 07:00.' }),
      // A slow cap so the window can close mid-download.
      throttle: async (n) => {
        slow.set('bytes', (slow.get('bytes') ?? 0) + n);
        await new Promise((r) => setTimeout(r, 30));
      },
    });
    m.init();
    addItem('night', [{ name: 'night.pdf', format: 'Text PDF', body: bytes(3_000_000) }]);
    const job = m.createJob([tray('night')], 'pdf', 'skip');
    await new Promise((r) => setTimeout(r, 100));
    expect(m.getJob(job)!.tasks[0]!.state).toBe('queued');
    expect(m.queueStatus().waiting).toBe('Downloads run between 23:00 and 07:00.');

    open = true;
    m.checkWindow();
    await new Promise((r) => setTimeout(r, 150));
    expect(m.getJob(job)!.tasks[0]!.state).toBe('downloading');

    open = false;
    m.checkWindow();
    await new Promise((r) => setTimeout(r, 150));
    expect(m.getJob(job)!.tasks[0]).toMatchObject({ state: 'queued', note: 'Waiting for the download window' });

    open = true;
    m.checkWindow();
    await m.idle();
    expect(m.getJob(job)!.tasks[0]!.state).toBe('done');
    // The second run resumed from the partial file.
    expect(requests.filter((r) => r.path === '/night/night.pdf').some((r) => r.range)).toBe(true);
  });
});
