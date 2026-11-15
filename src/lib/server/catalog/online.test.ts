import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseManifest, pruneCache } from './online';

const canvas = (svc: string, label?: string) => ({
  label: label ? { none: [label] } : undefined,
  width: 1000,
  height: 1500,
  items: [{ items: [{ body: { service: [{ id: svc }] } }] }],
});

describe('online pages', () => {
  it('reads canvases from a IIIF manifest, archive.org services only', () => {
    const pages = parseManifest({ items: [canvas('https://iiif.archive.org/image/iiif/3/a%2Fp1', 'i'), canvas('https://evil.example/x'), canvas('https://iiif.archive.org/image/iiif/3/a%2Fp2', '2')] });
    expect(pages).toEqual([
      { n: 1, label: 'i', width: 1000, height: 1500, service: 'https://iiif.archive.org/image/iiif/3/a%2Fp1' },
      { n: 2, label: '2', width: 1000, height: 1500, service: 'https://iiif.archive.org/image/iiif/3/a%2Fp2' },
    ]);
  });

  describe('cache', () => {
    let dir: string;
    beforeEach(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stacks-pages-'));
      process.env.STACKS_PAGES = dir;
    });
    afterEach(() => {
      delete process.env.STACKS_PAGES;
      fs.rmSync(dir, { recursive: true, force: true });
    });

    it('drops the least recently used pages over the limit', async () => {
      fs.mkdirSync(path.join(dir, 'book'));
      for (const [n, age] of [[1, 3000], [2, 2000], [3, 1000]] as const) {
        const p = path.join(dir, 'book', `${n}-1200.jpg`);
        fs.writeFileSync(p, Buffer.alloc(100));
        const t = new Date(Date.now() - age * 1000);
        fs.utimesSync(p, t, t);
      }
      await pruneCache(200, Date.now() + 120_000);
      expect(fs.readdirSync(path.join(dir, 'book')).sort()).toEqual(['2-1200.jpg', '3-1200.jpg']);
    });
  });
});
