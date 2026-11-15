import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, setDbForTests } from '../db/client';
import type { PageItem } from '@/lib/shared/textMatch';
import { addNamedBookmarks, annotationsFor, createAnnotation } from './annotations';
import { findHeadings, headingKey, keyAround, linesOf, tidy } from './headings';

/** A page whose lines are given top to bottom; each line is one item. */
function page(n: number, lines: string[]) {
  let text = '';
  const items: PageItem[] = [];
  lines.forEach((l, i) => {
    if (text) text += ' ';
    items.push([text.length, l.length, 0.1, 0.05 + i * 0.1, 0.8, 0.02]);
    text += l;
  });
  return { page: n, text, items };
}

describe('contents from headings', () => {
  it('groups items into lines left to right', () => {
    const p = { page: 1, text: 'सर्गः नवमः', items: [[6, 4, 0.3, 0.05, 0.1, 0.02], [0, 5, 0.5, 0.051, 0.1, 0.02]] as PageItem[] };
    expect(linesOf(p.text, p.items).map((l) => l.text)).toEqual(['नवमः सर्गः']);
  });

  it('takes the first page of each run of running heads as the chapter start', () => {
    const pages = [
      page(10, ['प्रथमः सर्गः', 'body text that goes on for a long while and is not a heading at all']),
      page(11, ['(२) प्रथमः सर्गः', 'more body text']),
      page(12, ['(३) प्रथमः सर्गः', 'more body']),
      page(13, ['द्वितीयः सर्गः', 'body']),
      page(14, ['(५) द्वितीयः सर्गः', 'body']),
      page(15, ['no heading here', 'body']),
    ];
    expect(findHeadings(pages, 'सर्गः')).toEqual([
      { page: 10, label: 'प्रथमः सर्गः' },
      { page: 13, label: 'द्वितीयः सर्गः' },
    ]);
  });

  it('treats OCR variants of a running head as one, keeps chapter numbers, skips colophons', () => {
    expect(headingKey('नवमः सर्गः । ( १५३')).toBe(headingKey('नवमः सर्गः! ` , ` (१६१)'));
    expect(keyAround(headingKey('५२ गीताकी विभति यर विश्वरूप [ अ० १०'), 'अ0')).toBe(keyAround(headingKey('५४ गीताकी विभूति ओर विश्वरूप [अ० १०'), 'अ0'));
    expect(keyAround(headingKey('५२ गीताकी [ अ० १०'), 'अ0')).not.toBe(keyAround(headingKey('५४ गीताकी [ अ० ११'), 'अ0'));
    const pages = [
      page(158, ['नवमः सर्गः । ( १५३', 'body']),
      page(160, ['नवमः सगः । ( १५५', 'body']),
      page(166, ['नवमः सर्गः! (१६१)', 'body']),
      page(180, ['body', 'रघुवंशे महाकाव्ये नवमो नाम सर्गः', 'more']),
      page(182, ['दशमः सर्गः (१७७)', 'body']),
    ];
    expect(findHeadings(pages, 'सर्गः').map((h) => h.page)).toEqual([158, 182]);
  });

  it('cleans folios and OCR debris out of names, keeping chapter numbers', () => {
    expect(tidy('नवमः सर्गः । ( १५३')).toBe('नवमः सर्गः ।');
    expect(tidy("द्रादशः सर्गः! .' ` , (२०५")).toBe('द्रादशः सर्गः');
    expect(tidy('५२ गीताकी विभूति [ अ० १०')).toBe('गीताकी विभूति अ० १०');
  });

  it('ignores the word deep in long body lines', () => {
    const pages = [page(3, ['title', 'a', 'b', 'c', 'd', 'and here the body mentions सर्गः in a long sentence of text'])];
    expect(findHeadings(pages, 'सर्गः')).toEqual([]);
  });
});

describe('named bookmarks in bulk', () => {
  beforeEach(() => setDbForTests(openDb(':memory:')));
  afterEach(() => setDbForTests(undefined));

  it('adds new ones, names unnamed ones, keeps named ones', () => {
    createAnnotation({ file: 'b.pdf', identifier: null, page: 5, kind: 'bookmark' });
    createAnnotation({ file: 'b.pdf', identifier: null, page: 9, kind: 'bookmark', note: 'Mine' });
    const changed = addNamedBookmarks('b.pdf', null, [
      { page: 5, name: 'सर्ग १' },
      { page: 9, name: 'सर्ग २' },
      { page: 20, name: 'सर्ग ३' },
    ]);
    expect(changed).toHaveLength(2);
    expect(annotationsFor('b.pdf').map((a) => [a.page, a.note])).toEqual([
      [5, 'सर्ग १'],
      [9, 'Mine'],
      [20, 'सर्ग ३'],
    ]);
  });
});
