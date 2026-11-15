import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createBackup, listDailyBackups, restoreBackup, writeDailyBackup } from './backup';
import { openDb, setDbForTests } from './db/client';
import { annotationsFor, createAnnotation, updateAnnotation } from './library/annotations';
import { getPageOffset, setPageOffset } from './library/bookText';

const FILE = 'Books/Raghuvansham (1913) [raghu].pdf';

beforeEach(() => setDbForTests(openDb(':memory:')));
afterEach(() => setDbForTests(undefined));

describe('backup and restore', () => {
  it('round-trips into an empty database', () => {
    createAnnotation({ file: FILE, identifier: 'raghu', page: 166, kind: 'bookmark', note: 'सर्ग ९' });
    setPageOffset(FILE, 5);
    const backup = JSON.parse(JSON.stringify(createBackup()));

    setDbForTests(openDb(':memory:'));
    const summary = restoreBackup(backup);
    expect(summary.annotations).toEqual({ added: 1, updated: 0 });
    expect(summary.bookPrefs.added).toBe(1);
    expect(annotationsFor(FILE)[0]).toMatchObject({ kind: 'bookmark', note: 'सर्ग ९' });
    expect(getPageOffset(FILE)).toBe(5);
  });

  it('merges: adds missing rows, keeps the newer copy, deletes nothing', async () => {
    const a = createAnnotation({ file: FILE, identifier: 'raghu', page: 3, kind: 'note', note: 'old' });
    const backup = JSON.parse(JSON.stringify(createBackup()));
    await new Promise((r) => setTimeout(r, 5));
    updateAnnotation(a.id, { note: 'newer here' });
    createAnnotation({ file: FILE, identifier: 'raghu', page: 9, kind: 'note', note: 'only here' });

    const summary = restoreBackup(backup);
    expect(summary.annotations).toEqual({ added: 0, updated: 0 });
    expect(annotationsFor(FILE).map((x) => x.note)).toEqual(['newer here', 'only here']);
  });

  it('rejects files that are not Stacks backups', () => {
    expect(() => restoreBackup({ hello: 'world' })).toThrow();
    expect(() => restoreBackup({ ...createBackup(), version: 99 })).toThrow();
  });
});

describe('daily copies', () => {
  it('writes once a day and keeps the newest 30', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stacks-backups-'));
    try {
      for (let d = 1; d <= 32; d++) writeDailyBackup(dir, new Date(Date.UTC(2026, 0, d, 12)));
      expect(writeDailyBackup(dir, new Date(Date.UTC(2026, 0, 32, 12)))).toBeNull();
      const files = fs.readdirSync(dir).sort();
      expect(files).toHaveLength(30);
      expect(files[0]).toBe('stacks-backup-2026-01-03.json');
      expect(listDailyBackups(dir).count).toBe(30);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
