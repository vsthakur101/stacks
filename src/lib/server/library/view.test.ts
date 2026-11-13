import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, setDbForTests } from '../db/client';
import { httpCache } from '../db/schema';
import { setFetchForTests } from '../http';
import { invalidateLibraryScan } from './scan';
import { buildLibrary } from './view';

let root: string;
let handle: ReturnType<typeof openDb>;
const put = (rel: string, bytes: number, mtime: number) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, Buffer.alloc(bytes));
  fs.utimesSync(full, mtime / 1000, mtime / 1000);
};
const cacheMeta = (id: string, title: string, language: string) =>
  handle.db
    .insert(httpCache)
    .values({ url: `https://archive.org/metadata/${id}`, status: 200, body: JSON.stringify({ metadata: { title, language, date: '1923' }, files: [] }), fetchedAt: Date.now(), ttlS: 86400 })
    .run();

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'stacks-view-'));
  handle = openDb(':memory:');
  setDbForTests(handle);
  setFetchForTests((() => Promise.reject(new Error('offline in tests'))) as unknown as typeof fetch);
  invalidateLibraryScan();
  put('Books/Gita Rahasya (1915) [gita-r].pdf', 300, 1_000_000_000_000);
  put('Books/Anand Math [anand].epub', 100, 1_100_000_000_000);
  put('Magazines/BYTE/1985-02-01 BYTE [byte-85].pdf', 200, 1_050_000_000_000);
  put('loose notes.txt', 5, 1_000_000_000_000);
  cacheMeta('gita-r', 'Gita Rahasya', 'Hindi');
  cacheMeta('byte-85', 'BYTE February 1985', 'eng');
});
afterEach(() => {
  setDbForTests(undefined);
  setFetchForTests(undefined);
  fs.rmSync(root, { recursive: true, force: true });
});

describe('buildLibrary', () => {
  it('lists items newest first, using cached titles or the file name', async () => {
    const lib = await buildLibrary(root, { sort: 'recent' });
    expect(lib.entries.map((e) => e.title)).toEqual(['Anand Math', 'BYTE February 1985', 'Gita Rahasya']);
    expect(lib).toMatchObject({ totalItems: 3, totalBytes: 605 });
    expect(lib.others.map((f) => f.name)).toEqual(['loose notes.txt']);
  });

  it('maps archive.org languages to the filter list, unknown when not cached', async () => {
    const lib = await buildLibrary(root, { sort: 'title' });
    expect(Object.fromEntries(lib.entries.map((e) => [e.identifier, e.language]))).toEqual({ anand: 'und', 'byte-85': 'eng', 'gita-r': 'hin' });
  });

  it('filters by section, language and text, and sorts by size', async () => {
    expect((await buildLibrary(root, { section: 'magazines', sort: 'recent' })).entries.map((e) => e.identifier)).toEqual(['byte-85']);
    expect((await buildLibrary(root, { lang: 'hin', sort: 'recent' })).entries.map((e) => e.identifier)).toEqual(['gita-r']);
    expect((await buildLibrary(root, { q: 'rahasya', sort: 'recent' })).entries.map((e) => e.identifier)).toEqual(['gita-r']);
    expect((await buildLibrary(root, { sort: 'size' })).entries.map((e) => e.identifier)).toEqual(['gita-r', 'byte-85', 'anand']);
  });
});
