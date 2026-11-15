import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, setDbForTests } from '../db/client';
import { downloadJobs, downloadTasks } from '../db/schema';
import { downloadedFiles } from '../downloads/library';
import { invalidateLibraryScan } from '../library/scan';
import { saveSettings } from '../settings';
import { clearSearchHistory, deleteShelf, listShelves, recentSearches, recordSearch, saveShelf } from './library';

let handle: ReturnType<typeof openDb>;
beforeEach(() => {
  handle = openDb(':memory:');
  setDbForTests(handle);
});
afterEach(() => setDbForTests(undefined));

describe('recent searches', () => {
  it('records each distinct search once, newest first, ignoring the page', async () => {
    recordSearch('/books', { q: 'gita', lang: 'san' });
    await new Promise((r) => setTimeout(r, 5));
    recordSearch('/magazines', { q: 'byte', sort: 'old' });
    await new Promise((r) => setTimeout(r, 5));
    recordSearch('/books', { lang: 'san', q: 'gita', page: '3' });

    const recent = recentSearches();
    expect(recent.map((r) => r.label)).toEqual(['gita', 'byte']);
    expect(recent[0]).toMatchObject({ href: '/books?lang=san&q=gita', detail: 'books, Sanskrit' });
    expect(recent[1]).toMatchObject({ detail: 'magazines, oldest' });
  });

  it('keeps one entry per query and place, reopening the view used last', async () => {
    recordSearch('/books', { q: 'mahabharat', source: 'archive' });
    await new Promise((r) => setTimeout(r, 5));
    recordSearch('/books', { q: 'Mahabharat', source: 'archive', sort: 'read' });
    const recent = recentSearches();
    expect(recent).toHaveLength(1);
    expect(recent[0]).toMatchObject({ label: 'Mahabharat', href: '/books?q=Mahabharat&sort=read&source=archive' });
  });

  it('skips empty queries and unknown paths, and clears', () => {
    recordSearch('/books', {});
    recordSearch('/settings', { q: 'x' });
    expect(recentSearches()).toEqual([]);
    recordSearch('/search', { q: 'gita' });
    clearSearchHistory();
    expect(recentSearches()).toEqual([]);
  });
});

describe('saved shelves', () => {
  it('saves, lists and deletes', () => {
    const id = saveShelf('Gita, Sanskrit', '/books', { q: 'gita', lang: 'san', source: 'archive', page: '2' });
    expect(listShelves()).toEqual([
      expect.objectContaining({ id, title: 'Gita, Sanskrit', href: '/books?lang=san&q=gita&source=archive' }),
    ]);
    expect(deleteShelf(id)).toBe(true);
    expect(listShelves()).toEqual([]);
  });
});

describe('downloadedFiles', () => {
  it('merges the download folder with history, and survives cleared history', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stacks-root-'));
    const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'stacks-elsewhere-'));
    saveSettings({ downloadRoot: root, concurrency: 3 });

    // In the folder, with no history at all (as after "Clear finished").
    fs.mkdirSync(path.join(root, 'Books'));
    const scanned = path.join(root, 'Books', 'Pride and Prejudice (1813) [pp].pdf');
    fs.writeFileSync(scanned, 'x');
    // In history only (the download folder was changed later).
    const kept = path.join(elsewhere, 'kept.pdf');
    fs.writeFileSync(kept, 'x');
    const now = Date.now();
    handle.db.insert(downloadJobs).values({ id: 'j', createdAt: now, format: 'pdf', fallback: 'skip', itemCount: 3 }).run();
    const task = (id: string, identifier: string, state: string, destPath: string) =>
      handle.db.insert(downloadTasks).values({ id, jobId: 'j', seq: 0, identifier, itemJson: '{}', state, destPath, updatedAt: now }).run();
    task('t1', 'kept', 'done', kept);
    task('t2', 'deleted', 'done', path.join(elsewhere, 'gone.pdf'));
    task('t3', 'failed', 'failed', kept);
    invalidateLibraryScan();

    const files = await downloadedFiles();
    expect(Object.fromEntries(files)).toEqual({ pp: [scanned], kept: [kept] });
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(elsewhere, { recursive: true, force: true });
  });
});

describe('watched searches', () => {
  it('asks archive.org for uploads after a time without fractional seconds', async () => {
    const { addedSince } = await import('./library');
    expect(addedSince(Date.UTC(2026, 10, 1, 14, 5, 9, 123))).toBe('addeddate:[2026-11-01T14:05:09Z TO null]');
  });
});
