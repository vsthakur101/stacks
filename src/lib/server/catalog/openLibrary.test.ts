import { describe, expect, it } from 'vitest';
import { olText, subjectSlug } from './openLibrary';

describe('Devanagari handling', () => {
  it('keeps vowel signs and viramas in search text', () => {
    expect(olText('गीता')).toBe('गीता');
    expect(olText('श्रीमद्भगवद्गीता (Gita Press)')).toBe('श्रीमद्भगवद्गीता Gita Press');
    expect(olText('महाभारत: आदि पर्व')).toBe('महाभारत आदि पर्व');
  });

  it('builds subject slugs without breaking Indic words', () => {
    expect(subjectSlug('Hindu philosophy')).toBe('hindu_philosophy');
    expect(subjectSlug('Café society')).toBe('cafe_society');
    expect(subjectSlug('हिन्दू धर्म')).toBe('हिन्दू_धर्म');
  });
});
