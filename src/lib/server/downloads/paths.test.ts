import { describe, expect, it } from 'vitest';
import { absoluteDestination, extensionOf, relativeDestination, sanitizeSegment } from './paths';

describe('relativeDestination', () => {
  it('names books Title (Year) [id].ext', () => {
    expect(
      relativeDestination({
        item: { identifier: 'pp1813', title: 'Pride and Prejudice', section: 'books', year: 1813 },
        fileName: 'pp1813.pdf',
        multiFile: false,
      }),
    ).toBe('Books/Pride and Prejudice (1813) [pp1813].pdf');
  });

  it('files newspaper issues under their publication by date', () => {
    expect(
      relativeDestination({
        item: { identifier: 'nyt-1923', title: 'Evening Edition', section: 'newspapers', date: '1923-04-07', publication: 'The Daily: Herald' },
        fileName: 'nyt-1923_djvu.txt',
        multiFile: false,
      }),
    ).toBe('Newspapers/The Daily Herald/1923-04-07 Evening Edition [nyt-1923].txt');
  });

  it('falls back to metadata publication, then Unsorted', () => {
    const item = { identifier: 'r1', title: 'Report', section: 'government' as const, year: 1950 };
    expect(relativeDestination({ item, publicationFallback: 'USDA', fileName: 'r1.pdf', multiFile: false })).toBe(
      'Government/USDA/Report (1950) [r1].pdf',
    );
    expect(relativeDestination({ item, fileName: 'r1.pdf', multiFile: false })).toBe('Government/Unsorted/Report (1950) [r1].pdf');
  });

  it('puts multi-file items in a folder and flattens subdirectories', () => {
    expect(
      relativeDestination({
        item: { identifier: 'enc', title: 'Encyclopaedia', section: 'books' },
        fileName: 'vols/vol1.pdf',
        multiFile: true,
      }),
    ).toBe('Books/Encyclopaedia [enc]/vols - vol1.pdf');
  });

  it('keeps the identifier when truncating very long titles', () => {
    const rel = relativeDestination({
      item: { identifier: 'long-id', title: 'ü'.repeat(400), section: 'manuscripts' },
      fileName: 'x.pdf',
      multiFile: false,
    });
    const name = rel.split('/').pop()!;
    expect(Buffer.byteLength(name)).toBeLessThanOrEqual(210);
    expect(name.endsWith('[long-id].pdf')).toBe(true);
  });
});

describe('path safety', () => {
  it('strips separators and leading dots', () => {
    expect(sanitizeSegment('../../etc/passwd')).toBe('etc passwd');
    expect(sanitizeSegment('   ')).toBe('Untitled');
  });

  it('refuses destinations outside the root', () => {
    expect(() => absoluteDestination('/tmp/root', '../escape.pdf')).toThrow();
    expect(absoluteDestination('/tmp/root', 'Books/a.pdf')).toBe('/tmp/root/Books/a.pdf');
  });

  it('extracts sane extensions only', () => {
    expect(extensionOf('a_jp2.zip')).toBe('.zip');
    expect(extensionOf('noext')).toBe('');
  });
});
