import { describe, expect, it } from 'vitest';
import { allowedErrors, findInText, normalizeQuery, normalizeWithMap, rectsFor, snippetFor, type PageItem } from './textMatch';

const hits = (text: string, q: string, close = true) => findInText(text, normalizeQuery(q), close).map((m) => [text.slice(m.start, m.end), m.distance]);

describe('normalisation', () => {
  it('ignores spaces, dandas, nukta and case; maps digits and chandrabindu', () => {
    expect(normalizeWithMap('धर्म क्षेत्रे ।। Mr. ').norm).toBe('धर्मक्षेत्रेmr');
    expect(normalizeQuery('(१६१)')).toBe('161');
    expect(normalizeQuery('हँस')).toBe(normalizeQuery('हंस'));
    expect(normalizeQuery('ज़')).toBe('ज');
  });

  it('maps every kept character back to the original text', () => {
    const { norm, map } = normalizeWithMap('a, b');
    expect(norm).toBe('ab');
    expect(map).toEqual([0, 3]);
  });
});

describe('find in text', () => {
  it('finds exact matches across OCR word breaks', () => {
    expect(hits('धर्मक्षे त्रे कुरुक्षेत्रे समवेता युयुत्सवः', 'धर्मक्षेत्रे')).toEqual([['धर्मक्षे त्रे', 0]]);
    expect(hits('Mr. Bennet and Mrs. Bennet', 'bennet', false)).toHaveLength(2);
  });

  it('finds close matches despite an OCR slip, labelled with their distance', () => {
    // "और" printed as "मोर" by the OCR: two edits (औ→म, +ो), within the 2 allowed for 8 letters.
    expect(hits('गीता विभूति मोर विश्वरूप', 'विभूति और')).toEqual([['विभूति मोर', 2]]);
    expect(hits('Mr. Bingley had always intended', 'Bingly')).toEqual([['Bingley', 1]]);
  });

  it('keeps exact matches only when close matching is off', () => {
    expect(hits('Bingley', 'Bingly', false)).toEqual([]);
  });

  it('does not allow errors in very short queries', () => {
    expect(allowedErrors(3)).toBe(0);
    expect(hits('राम रामा', 'राम')).toHaveLength(2);
    expect(hits('काम', 'राम')).toEqual([]);
  });

  it('reports one match per place, not one per candidate end', () => {
    expect(hits('xx intended xx', 'intended')).toEqual([['intended', 0]]);
  });
});

describe('snippets and boxes', () => {
  it('cuts snippets at spaces', () => {
    const text = 'one two three four five six seven eight nine ten eleven twelve';
    const s = snippetFor(text, text.indexOf('six'), text.indexOf('six') + 3, 10);
    expect(s.match).toBe('six');
    expect(s.before.startsWith('…')).toBe(true);
    expect(s.after.endsWith('…')).toBe(true);
  });

  it('boxes the part of each item a match covers', () => {
    const items: PageItem[] = [
      [0, 10, 0.1, 0.2, 0.5, 0.02],
      [11, 10, 0.1, 0.23, 0.5, 0.02],
    ];
    const rects = rectsFor(items, 5, 15);
    expect(rects).toHaveLength(2);
    expect(rects[0]!.x).toBeCloseTo(0.35);
    expect(rects[0]!.w).toBeCloseTo(0.25);
    expect(rects[1]!.w).toBeCloseTo(0.2);
  });
});
