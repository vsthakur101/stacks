import { describe, expect, it } from 'vitest';
import { cleanTitle, escapeLucene, formatDisplayDate, parseDate, plainText, realCollections } from './normalize';

describe('parseDate', () => {
  it.each([
    ['1923', { iso: '1923', year: 1923 }],
    ['1923-04', { iso: '1923-04', year: 1923, month: 4 }],
    ['1923-04-07T00:00:00Z', { iso: '1923-04-07', year: 1923, month: 4, day: 7 }],
    ['[c1923]', { iso: '1923', year: 1923 }],
  ])('parses %s', (raw, expected) => {
    expect(parseDate(raw)).toMatchObject(expected);
  });

  it('falls back to the year field and rejects nonsense', () => {
    expect(parseDate('unknown', '1850')).toEqual({ iso: '1850', year: 1850 });
    expect(parseDate('1923-13-01')).toEqual({});
    expect(parseDate(undefined)).toEqual({});
  });

  it('takes the first element of array values', () => {
    expect(parseDate(['1901-02-03', '1999'])).toMatchObject({ iso: '1901-02-03' });
  });
});

describe('display helpers', () => {
  it('humanizes machine titles but leaves real titles alone', () => {
    expect(cleanTitle('sim_byte_1985-04', 'x')).toBe('sim byte 1985-04');
    expect(cleanTitle('  The   Time_Machine ', 'x')).toBe('The Time_Machine');
    expect(cleanTitle(undefined, 'some_identifier-v2')).toBe('some identifier v2');
  });

  it('drops fav- pseudo collections', () => {
    expect(realCollections(['newspapers', 'fav-someone', 'texts'])).toEqual(['newspapers', 'texts']);
    expect(realCollections('periodicals')).toEqual(['periodicals']);
  });

  it('escapes Lucene syntax in user text', () => {
    expect(escapeLucene('title:(evil) OR "x"')).toBe('title\\:\\(evil\\) OR \\"x\\"');
  });

  it('formats dates for display', () => {
    expect(formatDisplayDate('1923-04-07')).toBe('7 April 1923');
    expect(formatDisplayDate('1923-04')).toBe('April 1923');
    expect(formatDisplayDate('1923')).toBe('1923');
  });

  it('strips HTML from descriptions', () => {
    expect(plainText('<p>One &amp; two</p><p>Three<br/>four</p>')).toBe('One & two\n\nThree\nfour');
    expect(plainText({ type: '/type/text', value: 'Bio' })).toBe('Bio');
  });
});
