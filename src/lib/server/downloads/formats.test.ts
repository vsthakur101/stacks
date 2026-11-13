import { describe, expect, it } from 'vitest';
import type { ArchiveFile } from '../catalog/archive';
import { availability, pickFiles, resolveFiles } from './formats';

const files: ArchiveFile[] = [
  { name: 'book.pdf', format: 'Text PDF', size: '100', md5: 'a' },
  { name: 'book_bw.pdf', format: 'Image Container PDF', size: '300' },
  { name: 'book_djvu.txt', format: 'DjVuTXT', size: '10' },
  { name: 'book.epub', format: 'EPUB', size: '20', private: 'true' },
  { name: 'book_lcp.epub', format: 'LCP Encrypted EPUB', size: '20' },
  { name: 'book_scandata.xml', format: 'Scandata', size: '5' },
  { name: '../evil.pdf', format: 'PDF', size: '1' },
];

describe('pickFiles', () => {
  it('prefers the highest-priority archive.org format', () => {
    expect(pickFiles(files, 'pdf').map((f) => f.name)).toEqual(['book.pdf']);
  });

  it('never returns private or encrypted files', () => {
    expect(pickFiles(files, 'epub')).toEqual([]);
  });

  it('rejects path traversal in file names', () => {
    expect(pickFiles([{ name: '../evil.pdf', format: 'PDF' }], 'pdf')).toEqual([]);
  });

  it('returns every file of the format for multi-volume items', () => {
    const multi: ArchiveFile[] = [
      { name: 'vol2.pdf', format: 'Text PDF' },
      { name: 'vol1.pdf', format: 'Text PDF' },
    ];
    expect(pickFiles(multi, 'pdf').map((f) => f.name)).toEqual(['vol1.pdf', 'vol2.pdf']);
  });
});

describe('resolveFiles', () => {
  it('uses the fallback format when the requested one is missing', () => {
    expect(resolveFiles(files, 'epub', 'text')?.format).toBe('text');
    expect(resolveFiles(files, 'epub', 'skip')).toBeNull();
    expect(resolveFiles(files, 'djvu', 'pdf')?.files[0]?.name).toBe('book.pdf');
  });
});

describe('availability', () => {
  it('reports bytes per available friendly format', () => {
    const a = availability(files);
    expect(a.get('pdf')).toBe(100);
    expect(a.get('text')).toBe(10);
    expect(a.has('epub')).toBe(false);
  });
});
