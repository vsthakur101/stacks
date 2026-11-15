import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, setDbForTests } from '../db/client';
import { ensureBookText, extractPdfText, findInBook, getPageOffset, setPageOffset, suggestPageOffset } from './bookText';

/** A minimal PDF: one Helvetica line per page, at the top-left. */
function tinyPdf(lines: string[]): Buffer {
  const objects: string[] = [];
  const add = (body: string) => objects.push(body) && objects.length;
  const catalog = add('');
  const pagesRef = add('');
  const font = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const kids: number[] = [];
  for (const line of lines) {
    const stream = `BT /F1 12 Tf 72 720 Td (${line}) Tj ET`;
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesRef} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${content} 0 R >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesRef} 0 R >>`;
  objects[pagesRef - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(out.length);
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

let dir: string;
beforeEach(() => {
  setDbForTests(openDb(':memory:'));
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stacks-booktext-'));
});
afterEach(() => {
  setDbForTests(undefined);
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('book text', () => {
  it('extracts each page with item boxes as page fractions', async () => {
    const pages = await extractPdfText(new Uint8Array(tinyPdf(['Mr. Bennet was among the earliest', 'of those who waited on Mr. Bingley'])));
    expect(pages).toHaveLength(2);
    expect(pages[0]!.text).toBe('Mr. Bennet was among the earliest');
    const [start, length, x, y, w, h] = pages[0]!.items[0]!;
    expect([start, length]).toEqual([0, 33]);
    expect(x).toBeCloseTo(72 / 612, 3);
    expect(y).toBeGreaterThan(0.05);
    expect(y).toBeLessThan(0.1);
    expect(w).toBeGreaterThan(0.2);
    expect(h).toBeCloseTo(12 / 792, 3);
  });

  it('stores text once, finds exact then close matches with boxes, and re-reads a changed file', async () => {
    const file = path.join(dir, 'book.pdf');
    fs.writeFileSync(file, tinyPdf(['Mr. Bennet was among the earliest', 'of those who waited on Mr. Bingly']));
    const info = await ensureBookText(file, 'Books/book.pdf');
    expect(info).toMatchObject({ pages: 2, searchable: false });

    const exact = await findInBook('Books/book.pdf', 'bennet');
    expect(exact.matches.map((m) => [m.page, m.distance, m.snippet.match])).toEqual([[1, 0, 'Bennet']]);
    expect(exact.matches[0]!.rects[0]!.w).toBeGreaterThan(0.01);

    const close = await findInBook('Books/book.pdf', 'Bingley');
    expect(close.matches.map((m) => [m.page, m.distance, m.snippet.match])).toEqual([[2, 1, 'Bingly']]);

    fs.writeFileSync(file, tinyPdf(['Something else entirely']));
    fs.utimesSync(file, new Date(), new Date(Date.now() + 5000));
    expect((await ensureBookText(file, 'Books/book.pdf')).pages).toBe(1);
    expect((await findInBook('Books/book.pdf', 'bennet')).matches).toEqual([]);
  });

  it('also searches the Devanagari form of a romanised query in a Devanagari book', async () => {
    const { getDb } = await import('../db/client');
    const { bookTextPages } = await import('../db/schema');
    getDb().insert(bookTextPages).values({ file: 'b.pdf', page: 3, text: 'गीता विभूति और विश्वरूप', itemsJson: '[[0,24,0.1,0.1,0.8,0.02]]' }).run();
    const res = await findInBook('b.pdf', 'vibhuti', { transliterate: async (w) => (w === 'vibhuti' ? 'विभूति' : undefined) });
    expect(res.searchedFor).toEqual(['vibhuti', 'विभूति']);
    expect(res.matches.map((m) => m.snippet.match)).toEqual(['विभूति']);
  });
});

describe('printed page numbers', () => {
  it('suggests the offset when folios agree on enough pages', () => {
    const pages = Array.from({ length: 30 }, (_, i) => {
      const page = i + 1;
      const folio = page > 5 ? `(${String(page - 5).replace(/\d/g, (d) => '०१२३४५६७८९'[Number(d)]!)})` : 'Preface';
      const text = `${folio} नवमः सर्गः body text`;
      return { page, text, items: [[0, folio.length, 0.1, 0.05, 0.1, 0.02], [folio.length + 1, 20, 0.1, 0.1, 0.8, 0.02]] as [number, number, number, number, number, number][] };
    });
    expect(suggestPageOffset(pages)).toBe(5);
    expect(suggestPageOffset(pages.slice(0, 7))).toBeNull();
  });

  it('remembers an offset per book', () => {
    expect(getPageOffset('a.pdf')).toBeNull();
    setPageOffset('a.pdf', 5);
    expect(getPageOffset('a.pdf')).toBe(5);
    setPageOffset('a.pdf', null);
    expect(getPageOffset('a.pdf')).toBeNull();
  });
});
