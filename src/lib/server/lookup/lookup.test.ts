import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { openDb, setDbForTests } from '../db/client';
import { setFetchForTests } from '../http';
import { cleanWord, lookupWord } from './lookup';
import { leadingParts, parseMw, stemCandidates } from './sanskrit';
import { parseWiktionary } from './wiktionary';

const MW_PAGE = `<html><body><div id='CologneBasic'>
<h1>&nbsp;<span class='sdata_siddhanta'>धर्मक्षेत्र</span></h1>
<table class='display'>
<tr><td class='display' valign="top"> <span style='font-weight:bold'>(H3) <span class='hrefdata'><span> [Printed book page <a href='x'>510</a>,3]</span></span></span><br>
<span class='sdata_siddhanta'>धर्म—क्षेत्र</span> <span title='neuter gender'>n.</span> ‘law-field’ = <span class='sdata_siddhanta'>कुरु-क्षेत्र</span>, q.v. <span class='lnum'> [<span>ID=99972</span> ]</span></td></tr>
<tr><td class='display' valign="top">N. of a country &amp; its people</td></tr>
</table></div></body></html>`;

describe('Sanskrit forms', () => {
  it('trims case endings to likely stems', () => {
    expect(stemCandidates('धर्मक्षेत्रे')).toContain('धर्मक्षेत्र');
    expect(stemCandidates('समवेताः')).toContain('समवेत');
    expect(stemCandidates('युयुत्सवः')).toContain('युयुत्सु');
    expect(stemCandidates('भगवान्')).toContain('भगवत्');
    expect(stemCandidates('रामस्य')).toContain('राम');
    expect(stemCandidates('राम')).toEqual([]);
  });

  it('splits leading parts at letter boundaries, longest first', () => {
    expect(leadingParts('धर्मक्षेत्रे')).toEqual(['धर्मक्षे', 'धर्म']);
  });

  it('parses a Monier-Williams page into headword and senses', () => {
    expect(parseMw(MW_PAGE)).toEqual({
      headword: 'धर्मक्षेत्र',
      senses: ['धर्म—क्षेत्र n. ‘law-field’ = कुरु-क्षेत्र, q.v.', 'N. of a country & its people'],
    });
    expect(parseMw("<h1>x</h1> not found: 'धर्मक्षेत्रे'")).toBeNull();
    const withRef = MW_PAGE.replace("<tr><td class='display' valign=\"top\">N. of", "<tr><td class='display'>भगवत् &amp;c. See p. 743, col. 3.</td></tr><tr><td class='display' valign=\"top\">N. of");
    expect(parseMw(withRef)!.senses).toHaveLength(2);
  });

  it('cleans what a selection drags along', () => {
    expect(cleanWord(' ।धर्मक्षेत्रे, ')).toBe('धर्मक्षेत्रे');
    expect(cleanWord('(१६१)')).toBe('');
  });
});

describe('Wiktionary', () => {
  it('reads definitions and notices pure form-of entries', () => {
    const senses = parseWiktionary(
      {
        hi: [{ partOfSpeech: 'Noun', definitions: [{ definition: '<a href="/wiki/glory">glory</a>, greatness' }] }],
        sa: [{ partOfSpeech: 'Adjective', definitions: [{ definition: '<span class="form-of-definition">masculine nominative singular of <span class="form-of-definition-link"><i><a href="/wiki/भगवत्#Sanskrit" title="भगवत्">भगवत्</a></i></span></span>' }] }],
        en: [{ partOfSpeech: 'Noun', definitions: [{ definition: 'ignored' }] }],
      },
      'विभूति',
    );
    expect(senses.map((s) => [s.lang, s.partOfSpeech, s.definitions[0], s.lemma])).toEqual([
      ['hi', 'Noun', 'glory, greatness', undefined],
      ['sa', 'Adjective', 'masculine nominative singular of भगवत्', 'भगवत्'],
    ]);
  });
});

describe('lookup', () => {
  beforeEach(() => setDbForTests(openDb(':memory:')));
  afterEach(() => {
    setFetchForTests(undefined);
    setDbForTests(undefined);
  });

  it('finds an inflected word through its stem and labels how', async () => {
    const asked: string[] = [];
    setFetchForTests(async (input) => {
      const url = new URL(String(input));
      const key = url.searchParams.get('key') ?? decodeURIComponent(url.pathname.split('/').pop() ?? '');
      asked.push(key);
      if (url.pathname.endsWith('getword.php')) {
        return new Response(key === 'धर्मक्षेत्र' ? MW_PAGE : `not found: '${key}'`, { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });
    const res = await lookupWord('धर्मक्षेत्रे');
    expect(res.sanskrit.map((e) => [e.headword, e.via])).toEqual([['धर्मक्षेत्र', 'ending']]);
    expect(res.sanskrit[0]!.url).toContain('getword.php');
    expect(asked).toContain('धर्मक्षेत्रे');
  });
});
