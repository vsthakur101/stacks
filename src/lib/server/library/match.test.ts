import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, setDbForTests } from '../db/client';
import { guessTitle, linkFile, unlinkFile } from './match';
import { scanFolder, scanLibrary } from './scan';

describe('guessing a title from a file name', () => {
  it('drops extensions, years, brackets, separators and noise words', () => {
    expect(guessTitle('Geeta_Ki-Vibhuti (1900) by Jaydayal.pdf')).toBe('Geeta Ki Vibhuti Jaydayal');
    expect(guessTitle('Bhavrog Ki Ramban Dawa By Hanuman Prasad 1976 Geeta Press.pdf')).toBe('Bhavrog Ki Ramban Dawa Hanuman Prasad Geeta Press');
    expect(guessTitle('शिव पुराण भाग 1.pdf')).toBe('शिव पुराण भाग 1');
  });
});

describe('linking files', () => {
  let dir: string;
  beforeEach(() => {
    setDbForTests(openDb(':memory:'));
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stacks-match-'));
    fs.mkdirSync(path.join(dir, 'Books'));
    fs.writeFileSync(path.join(dir, 'Books', 'my copy.pdf'), 'x'.repeat(1234));
  });
  afterEach(() => {
    setDbForTests(undefined);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('turns a linked Other file into the item, and back', async () => {
    const before = await scanLibrary(dir);
    expect(before.others.map((f) => f.name)).toEqual(['my copy.pdf']);
    linkFile(before.others[0]!, 'some-item');
    const after = await scanLibrary(dir);
    expect(after.others).toEqual([]);
    expect(after.items.map((i) => [i.identifier, i.files[0]!.linked])).toEqual([['some-item', true]]);
    expect(unlinkFile('Books/my copy.pdf')).toBe(true);
    expect((await scanLibrary(dir)).others).toHaveLength(1);
  });

  it('finds the link again after the file is moved (same name and size)', async () => {
    fs.mkdirSync(path.join(dir, 'Books', 'Moved'));
    fs.renameSync(path.join(dir, 'Books', 'my copy.pdf'), path.join(dir, 'Books', 'Moved', 'my copy.pdf'));
    const scan = await scanFolder(dir, [{ file: 'Books/my copy.pdf', identifier: 'some-item', name: 'my copy.pdf', size: 1234 }]);
    expect(scan.items[0]?.files[0]?.relative).toBe(path.join('Books', 'Moved', 'my copy.pdf'));
  });
});
