import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getDb, openDb, setDbForTests } from '../db/client';
import { bookTextPages } from '../db/schema';
import { createAnnotation } from './annotations';
import { findVerse, locateVerse, parseVerseRef } from './verses';

describe('verse references', () => {
  it('parses verse and chapter.verse in either script', () => {
    expect(parseVerseRef('47')).toEqual({ verse: 47 });
    expect(parseVerseRef('२.४७')).toEqual({ chapter: 2, verse: 47 });
    expect(parseVerseRef('2:47')).toEqual({ chapter: 2, verse: 47 });
    expect(parseVerseRef('abc')).toBeNull();
    expect(parseVerseRef('0')).toBeNull();
  });

  it('finds the verse marker in its OCR forms, not other numbers', () => {
    const pages = [
      { page: 10, text: 'कर्मण्येवाधिकारस्ते ॥ ४६ ॥ (४७)' },
      { page: 11, text: 'मा फलेषु कदाचन ।। ४७ ।। मा कर्मफलहेतुर्भूः' },
      { page: 12, text: 'something || 47 || else' },
    ];
    expect(findVerse(pages, 47, 1)).toBe(11);
    expect(findVerse(pages, 47, 12)).toBe(12);
    expect(findVerse(pages, 48, 1)).toBeNull();
  });
});

describe('locate a verse', () => {
  beforeEach(() => setDbForTests(openDb(':memory:')));
  afterEach(() => setDbForTests(undefined));

  it('uses bookmarks as chapters for chapter.verse, and wraps around for a bare verse', () => {
    const add = (page: number, text: string) => getDb().insert(bookTextPages).values({ file: 'g.pdf', page, text, itemsJson: '[]' }).run();
    add(5, 'प्रथमोऽध्यायः ॥ १ ॥ ॥ ४७ ॥');
    add(20, 'द्वितीयोऽध्यायः ॥ १ ॥');
    add(30, '॥ ४७ ॥ कर्मण्येवाधिकारस्ते');
    createAnnotation({ file: 'g.pdf', identifier: null, page: 5, kind: 'bookmark', note: 'अध्याय १' });
    expect(locateVerse('g.pdf', { chapter: 2, verse: 47 }, 1)).toMatchObject({ error: expect.stringContaining('needs a bookmark') });
    createAnnotation({ file: 'g.pdf', identifier: null, page: 20, kind: 'bookmark', note: 'अध्याय २' });
    expect(locateVerse('g.pdf', { chapter: 2, verse: 47 }, 1)).toEqual({ page: 30 });
    expect(locateVerse('g.pdf', { chapter: 1, verse: 47 }, 1)).toEqual({ page: 5 });
    expect(locateVerse('g.pdf', { verse: 47 }, 6)).toEqual({ page: 30 });
    expect(locateVerse('g.pdf', { verse: 47 }, 31)).toEqual({ page: 5 });
  });
});
