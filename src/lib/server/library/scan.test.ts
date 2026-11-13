import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { identifierFor, scanFolder, sectionFor, titleFromFileName } from './scan';

let root: string;
const put = (rel: string, bytes = 10) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, Buffer.alloc(bytes));
};

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'stacks-lib-'));
});
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('naming', () => {
  it('finds the identifier in the file name or its folder', () => {
    expect(identifierFor('Books/Pride and Prejudice (1813) [prideprejudice00aust].epub')).toBe('prideprejudice00aust');
    expect(identifierFor('Books/Encyclopaedia [enc-v1_2]/vols - vol1.pdf')).toBe('enc-v1_2');
    expect(identifierFor('Books/my own notes.pdf')).toBeUndefined();
    expect(identifierFor('Books/[not an id]/x.pdf')).toBeUndefined();
  });

  it('reads the section from the top folder and the title from the name', () => {
    expect(sectionFor('Magazines/BYTE Magazine/1985-02-01 x [b].pdf')).toBe('magazines');
    expect(sectionFor('Unsorted/x [b].pdf')).toBe('books');
    expect(titleFromFileName('1985-02-01 Byte Volume 10 [byte-magazine-1985-02].epub')).toBe('1985-02-01 Byte Volume 10');
  });
});

describe('scanFolder', () => {
  it('groups files by item, keeps other files, and skips partial and hidden files', async () => {
    put('Books/Pride and Prejudice (1813) [pp].epub', 100);
    put('Books/Pride and Prejudice (1813) [pp].pdf', 300);
    put('Books/Encyclopaedia [enc]/vol1.pdf', 50);
    put('Books/Encyclopaedia [enc]/vol2.pdf', 50);
    put('Magazines/BYTE/1985-02-01 BYTE [byte-1985-02].pdf', 20);
    put('Books/Gone [x].pdf.part', 5);
    put('.DS_Store', 1);
    put('My notes.txt', 7);

    const scan = await scanFolder(root);
    const byId = Object.fromEntries(scan.items.map((i) => [i.identifier, i]));
    expect(Object.keys(byId).sort()).toEqual(['byte-1985-02', 'enc', 'pp']);
    expect(byId.pp).toMatchObject({ section: 'books', bytes: 400 });
    expect(byId.pp!.files.map((f) => f.ext)).toEqual(['epub', 'pdf']);
    expect(byId.enc!.files).toHaveLength(2);
    expect(byId['byte-1985-02']!.section).toBe('magazines');
    expect(scan.others.map((f) => f.relative)).toEqual(['My notes.txt']);
  });

  it('does not follow symlinks out of the folder', async () => {
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'stacks-outside-'));
    fs.writeFileSync(path.join(outside, 'secret [s].pdf'), 'x');
    fs.symlinkSync(outside, path.join(root, 'Books'));
    const scan = await scanFolder(root);
    expect(scan.items).toEqual([]);
    fs.rmSync(outside, { recursive: true, force: true });
  });

  it('returns an empty library for a folder that does not exist yet', async () => {
    expect(await scanFolder(path.join(root, 'missing'))).toMatchObject({ items: [], others: [] });
  });
});
