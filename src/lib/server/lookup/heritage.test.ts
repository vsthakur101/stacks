import { describe, expect, it } from 'vitest';
import { devanagariToSlp1 } from '@/lib/shared/slp1';
import { glossGrammar, parseHeritage } from './heritage';

describe('Devanagari to SLP1', () => {
  it('handles inherent vowels, conjuncts, signs and marks', () => {
    expect(devanagariToSlp1('किमकुर्वत')).toBe('kimakurvata');
    expect(devanagariToSlp1('युयुत्सवः')).toBe('yuyutsavaH');
    expect(devanagariToSlp1('धर्मक्षेत्रे')).toBe('Darmakzetre');
    expect(devanagariToSlp1('गच्छति')).toBe('gacCati');
    expect(devanagariToSlp1('संस्कृतम्')).toBe('saMskftam');
  });
});

describe('Sanskrit Heritage', () => {
  it('parses the first solution into forms, dictionary forms and grammar', () => {
    const html = `<p>Solution 1 : <span>✓</span> [ <a>किम्</a> [ <a>किम्</a> ]{नपुं 2 एक | नपुं 1 एक} &lang;&rang;] [ <a>&#x0905;&#x0915;&#x0941;&#x0930;&#x094D;&#x0935;&#x0924;</a> [ <a>कृ१</a> ]{कर्तरि लङ् आपतनादि प्र बहु} &lang;&rang;]</p><p>Solution 2 : [ x [ y ]{पुं 1 एक}]</p>`;
    expect(parseHeritage(html)).toEqual([
      { form: 'किम्', lemma: 'किम्', grammar: 'नपुं 2 एक | नपुं 1 एक', gloss: 'neuter accusative singular, or neuter nominative singular' },
      { form: 'अकुर्वत', lemma: 'कृ', grammar: 'कर्तरि लङ् आपतनादि प्र बहु', gloss: 'active imperfect ātmanepada 3rd person plural' },
    ]);
    expect(parseHeritage('<p>No solution</p>')).toEqual([]);
    expect(parseHeritage('Solution 2 : ✓ [ युयुत्सवः [ युयुत्सु ]{पुं 1 बहु} ⟨⟩] 1 solution kept')).toEqual([
      { form: 'युयुत्सवः', lemma: 'युयुत्सु', grammar: 'पुं 1 बहु', gloss: 'masculine nominative plural' },
    ]);
  });

  it('glosses compound parts', () => {
    expect(glossGrammar('पूर्वपद')).toBe('first part of a compound');
  });
});
