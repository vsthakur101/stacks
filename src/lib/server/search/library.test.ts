import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, setDbForTests } from '../db/client';
import { downloadJobs, downloadTasks } from '../db/schema';
import { downloadedFiles } from '../downloads/library';
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
  it('lists finished downloads whose files still exist', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stacks-lib-'));
    const kept = path.join(dir, 'kept.pdf');
    fs.writeFileSync(kept, 'x');
    const now = Date.now();
    handle.db.insert(downloadJobs).values({ id: 'j', createdAt: now, format: 'pdf', fallback: 'skip', itemCount: 3 }).run();
    const task = (id: string, identifier: string, state: string, destPath: string) =>
      handle.db.insert(downloadTasks).values({ id, jobId: 'j', seq: 0, identifier, itemJson: '{}', state, destPath, updatedAt: now }).run();
    task('t1', 'kept', 'done', kept);
    task('t2', 'deleted', 'done', path.join(dir, 'gone.pdf'));
    task('t3', 'failed', 'failed', kept);

    expect([...downloadedFiles().entries()]).toEqual([['kept', [kept]]]);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
