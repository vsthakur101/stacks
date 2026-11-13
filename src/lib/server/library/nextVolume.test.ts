import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, setDbForTests } from '../db/client';
import { setFetchForTests } from '../http';
import { nextVolumeFile } from './nextVolume';
import { invalidateLibraryScan } from './scan';

let root: string;
const put = (rel: string) => {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, 'x');
};
beforeEach(() => {
  setDbForTests(openDb(':memory:'));
  setFetchForTests((() => Promise.reject(new Error('offline'))) as unknown as typeof fetch);
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'stacks-next-'));
  invalidateLibraryScan();
});
afterEach(() => {
  setDbForTests(undefined);
  setFetchForTests(undefined);
  fs.rmSync(root, { recursive: true, force: true });
});

describe('nextVolumeFile', () => {
  it('finds the next volume of the same set in the Library, from file names alone', async () => {
    put('Books/Siva Purana - Part 1 of 4 [SivaPuranaJ.L.ShastriPart1].pdf');
    put('Books/Siva Purana - Part 2 of 4 [SivaPuranaJ.L.ShastriPart2].pdf');
    put('Books/Other Purana Part 2 [OtherPuranaPart2].pdf');
    expect(await nextVolumeFile(root, 'SivaPuranaJ.L.ShastriPart1')).toEqual({
      relative: 'Books/Siva Purana - Part 2 of 4 [SivaPuranaJ.L.ShastriPart2].pdf',
      label: 'Part 2',
    });
  });

  it('returns nothing for the last volume or a book that is not a volume', async () => {
    put('Books/Siva Purana - Part 2 of 4 [SivaPuranaJ.L.ShastriPart2].pdf');
    put('Books/Pride and Prejudice (1813) [pp].pdf');
    expect(await nextVolumeFile(root, 'SivaPuranaJ.L.ShastriPart2')).toBeNull();
    expect(await nextVolumeFile(root, 'pp')).toBeNull();
  });
});
