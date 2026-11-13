import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, setDbForTests } from '../db/client';
import { getProgress, recentlyRead, saveProgress } from './progress';
import { invalidateLibraryScan } from './scan';

let root: string;
beforeEach(() => {
  setDbForTests(openDb(':memory:'));
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'stacks-progress-'));
  fs.mkdirSync(path.join(root, 'Books'));
  fs.writeFileSync(path.join(root, 'Books', 'A [a].pdf'), 'x');
  fs.writeFileSync(path.join(root, 'Books', 'B [b].pdf'), 'x');
  invalidateLibraryScan();
});
afterEach(() => {
  setDbForTests(undefined);
  fs.rmSync(root, { recursive: true, force: true });
});

describe('reading progress', () => {
  it('saves, clamps and updates the page', () => {
    saveProgress({ file: 'Books/A [a].pdf', identifier: 'a', title: 'A', page: 12, total: 100 });
    expect(getProgress('Books/A [a].pdf')).toMatchObject({ page: 12, total: 100 });
    saveProgress({ file: 'Books/A [a].pdf', identifier: 'a', title: 'A', page: 500, total: 100 });
    expect(getProgress('Books/A [a].pdf')?.page).toBe(100);
  });

  it('lists recently read files that still exist, newest first', async () => {
    saveProgress({ file: 'Books/A [a].pdf', identifier: 'a', title: 'A', page: 1, total: 10 });
    await new Promise((r) => setTimeout(r, 5));
    saveProgress({ file: 'Books/B [b].pdf', identifier: 'b', title: 'B', page: 2, total: 10 });
    await new Promise((r) => setTimeout(r, 5));
    saveProgress({ file: 'Books/Gone [g].pdf', identifier: 'g', title: 'Gone', page: 3, total: 10 });
    expect((await recentlyRead(root)).map((p) => p.title)).toEqual(['B', 'A']);
  });
});
