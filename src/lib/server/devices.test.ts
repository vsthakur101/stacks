import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bestFileFor, copyToDevice, listDevices } from './devices';
import type { LibraryFile } from './library/scan';

let vols: string;
let lib: string;
const file = (name: string, size = 100): LibraryFile => {
  const p = path.join(lib, name);
  fs.writeFileSync(p, 'x'.repeat(size));
  return { path: p, relative: `Books/${name}`, name, size, modifiedAt: 0, ext: name.split('.').pop()! };
};

beforeEach(() => {
  vols = fs.mkdtempSync(path.join(os.tmpdir(), 'stacks-vols-'));
  lib = fs.mkdtempSync(path.join(os.tmpdir(), 'stacks-lib-'));
  fs.mkdirSync(path.join(vols, 'Kindle', 'documents'), { recursive: true });
  fs.mkdirSync(path.join(vols, 'Kindle', 'system'));
  fs.mkdirSync(path.join(vols, 'KOBOeReader', '.kobo'), { recursive: true });
  fs.symlinkSync('/', path.join(vols, 'Macintosh HD'));
  process.env.STACKS_VOLUMES = vols;
});
afterEach(() => {
  delete process.env.STACKS_VOLUMES;
  fs.rmSync(vols, { recursive: true, force: true });
  fs.rmSync(lib, { recursive: true, force: true });
});

describe('e-readers', () => {
  it('recognises Kindles and Kobos, not the startup disk', async () => {
    const devices = await listDevices();
    expect(devices.map((d) => [d.name, d.kind, d.folder]).sort()).toEqual([
      ['KOBOeReader', 'kobo', ''],
      ['Kindle', 'kindle', 'documents'],
    ]);
  });

  it('copies into the right folder, skips what is already there, refuses EPUB for a Kindle without Calibre', async () => {
    const [kindle] = (await listDevices()).filter((d) => d.kind === 'kindle');
    const pdf = file('Raghuvansham [raghu].pdf');
    expect(await copyToDevice(kindle!, pdf)).toMatchObject({ status: 'copied', dest: path.join(vols, 'Kindle', 'documents', 'Raghuvansham [raghu].pdf') });
    expect(await copyToDevice(kindle!, pdf)).toMatchObject({ status: 'already-there' });
    const epub = file('Book [b].epub');
    const res = await copyToDevice(kindle!, epub, { convert: false });
    expect(res).toMatchObject({ status: 'unsupported' });
  });

  it('picks the file a device opens', () => {
    const files = [file('a.epub'), file('a.pdf'), file('a.txt')];
    expect(bestFileFor(files, 'kindle')?.ext).toBe('pdf');
    expect(bestFileFor([files[0]!], 'kindle')?.ext).toBe('epub');
    expect(bestFileFor([files[0]!, files[2]!], 'kobo')?.ext).toBe('epub');
  });
});
