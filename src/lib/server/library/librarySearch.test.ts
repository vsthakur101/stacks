import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, setDbForTests, getDb } from '../db/client';
import { bookTextPages } from '../db/schema';
import { backfillNorm } from './bookText';
import { searchLibrary } from './librarySearch';

beforeEach(() => setDbForTests(openDb(':memory:')));
afterEach(() => setDbForTests(undefined));

function page(file: string, page: number, text: string) {
  getDb().insert(bookTextPages).values({ file, page, text, itemsJson: '[]' }).run();
}

describe('library search', () => {
  it('finds exact matches across books after backfilling normalised text, most matches first', async () => {
    page('Books/Gita.pdf', 2, 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः');
    page('Books/Gita.pdf', 9, 'और फिर धर्मक्षे त्रे कुरुक्षेत्रे');
    page('Books/Raghu.pdf', 4, 'वागर्थाविव सम्पृक्तौ');
    page('Books/Other.pdf', 1, 'धर्मक्षेत्रे');
    expect(backfillNorm()).toBe(4);

    const res = await searchLibrary('धर्मक्षेत्रे कुरुक्षेत्रे', { transliterate: async () => undefined });
    expect(res.books.map((b) => [b.file, b.count])).toEqual([['Books/Gita.pdf', 2]]);
    expect(res.books[0]!.hits.map((h) => h.page)).toEqual([2, 9]);
    expect(res.books[0]!.hits[1]!.snippet.match).toBe('धर्मक्षे त्रे कुरुक्षेत्रे');
  });

  it('searches the Devanagari form of a romanised query and skips files no longer present', async () => {
    page('Books/Raghu.pdf', 4, 'रघुवंशम् महाकाव्यम्');
    page('Books/Gone.pdf', 1, 'रघुवंशम्');
    backfillNorm();
    const res = await searchLibrary('raghuvansham', {
      files: new Set(['Books/Raghu.pdf']),
      transliterate: async (w) => (w === 'raghuvansham' ? 'रघुवंशम्' : undefined),
    });
    expect(res.searchedFor).toEqual(['raghuvansham', 'रघुवंशम्']);
    expect(res.books.map((b) => b.file)).toEqual(['Books/Raghu.pdf']);
  });
});
