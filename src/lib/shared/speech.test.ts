import { describe, expect, it } from 'vitest';
import { speechChunks, speechLanguage } from './speech';

const at = (y: number) => ({ x: 0.1, y, w: 0.8, h: 0.02 });

describe('read aloud', () => {
  it('splits a page into sentences with their boxes, dropping verse numbers and junk', () => {
    const chunks = speechChunks([
      { str: 'धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः ।', rect: at(0.1) },
      { str: 'मामकाः पाण्डवाश्चैव किमकुर्वत सञ्जय ॥ १ ॥', rect: at(0.13) },
      { str: '¶ÉÉMÉÇ ´ÉÉÌiÉ ¨ÉÉ', rect: at(0.5) },
    ]);
    expect(chunks.map((c) => c.text)).toEqual(['धर्मक्षेत्रे कुरुक्षेत्रे समवेता युयुत्सवः ।', 'मामकाः पाण्डवाश्चैव किमकुर्वत सञ्जय ॥ ॥']);
    expect(chunks[1]!.rects).toEqual([at(0.13)]);
    expect(speechChunks([{ str: "'., ` नवमः सर्गः । ( १५३ ) ` विजिगीषोः", rect: at(0.1) }]).map((c) => c.text)).toEqual(['नवमः सर्गः । विजिगीषोः']);
  });

  it('keeps long runs short enough to speak', () => {
    const long = Array.from({ length: 40 }, (_, i) => ({ str: `word${i} and more`, rect: at(i / 50) }));
    expect(speechChunks(long).every((c) => c.text.length <= 240)).toBe(true);
  });

  it('picks the voice language from the script', () => {
    expect(speechLanguage('धर्मक्षेत्रे कुरुक्षेत्रे, p. 4')).toBe('hi');
    expect(speechLanguage('Mr. Bennet was among')).toBe('en');
  });
});
