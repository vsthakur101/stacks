import { describe, expect, it } from 'vitest';
import { buildFullTextQuery, parseFullText, parsePassage } from './fullText';

const RESPONSE = {
  hits: {
    total: 1301,
    hits: [
      {
        highlight: { text: ['धृतराष्ट उवाच-- {{{धर्मक्षेत्रे}}} {{{कुरुक्षेत्रे}}}\nसमवेता  युयुत्सवः', 'second', 'third', 'fourth'] },
        fields: {
          identifier: ['ksu.w11.descriptivecatal0000mran'],
          meta_title: ['A Descriptive Catalogue Of The Sanskrit Manuscripts : Volume IV'],
          meta_creator: ['M. Rangacharya'],
          meta_date: ['1907-01-01T00:00:00Z'],
          meta_languageSorter: ['Sanskrit'],
          meta_downloads: [38],
          page_num: [[380]],
        },
      },
      { highlight: { text: ['x {{{y}}}'] }, fields: { identifier: ['Sadhak-sanjivani'], meta_year: [2014], page_num: [null] } },
      { fields: { nothing: true } },
    ],
  },
};

describe('full-text search', () => {
  it('splits passages into plain text and matched words', () => {
    expect(parsePassage('a {{{धर्म}}} {{{क्षेत्र}}}\n b')).toEqual([
      { text: 'a ', hit: false },
      { text: 'धर्म', hit: true },
      { text: ' ', hit: false },
      { text: 'क्षेत्र', hit: true },
      { text: ' b', hit: false },
    ]);
  });

  it('parses hits: title, creator, year, language, page when known, up to 3 passages; skips odd records', () => {
    const page = parseFullText(RESPONSE, 1);
    expect(page.total).toBe(1301);
    expect(page.hits).toHaveLength(2);
    expect(page.hits[0]).toMatchObject({ identifier: 'ksu.w11.descriptivecatal0000mran', creator: 'M. Rangacharya', year: 1907, language: 'Sanskrit', page: 380 });
    expect(page.hits[0]!.passages).toHaveLength(3);
    expect(page.hits[1]).toMatchObject({ title: 'Sadhak-sanjivani', year: 2014, page: undefined });
  });

  it('builds queries: words or phrase, Devanagari for romanised Indic words, texts, language', async () => {
    const deva = async (w: string) => ({ dharmakshetre: 'धर्मक्षेत्रे', kurukshetre: 'कुरुक्षेत्रे' })[w];
    expect((await buildFullTextQuery({ q: 'समवेता युयुत्सवः', phrase: true, lang: 'hin' }, deva)).query).toBe(
      '"समवेता युयुत्सवः" AND meta_mediatype:texts AND meta_languageSorter:("Hindi")',
    );
    expect((await buildFullTextQuery({ q: 'समवेता युयुत्सवः' }, deva)).query).toBe('("समवेता" AND "युयुत्सवः") AND meta_mediatype:texts');
    const roman = await buildFullTextQuery({ q: 'dharmakshetre kurukshetre', phrase: true }, deva);
    expect(roman.alsoSearched).toBe('धर्मक्षेत्रे कुरुक्षेत्रे');
    expect(roman.query).toBe('("dharmakshetre kurukshetre" OR "धर्मक्षेत्रे कुरुक्षेत्रे") AND meta_mediatype:texts');
    expect((await buildFullTextQuery({ q: 'x', lang: 'und' }, deva)).query).toContain('AND NOT meta_languageSorter:("English" OR');
  });
});
