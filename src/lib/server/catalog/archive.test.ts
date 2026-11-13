import { describe, expect, it } from 'vitest';
import { isSafeIdentifier, languageClause, textsQuery, toItemCard } from './archive';
import { escapeLucene } from './normalize';

describe('textsQuery', () => {
  it('searches free texts only, keeping Devanagari intact', () => {
    const q = textsQuery(escapeLucene('महाभारत'));
    expect(q).toBe(
      '(महाभारत) AND mediatype:texts AND NOT collection:(inlibrary OR printdisabled) AND NOT access-restricted-item:true',
    );
  });

  it('cannot be broken out of by user syntax', () => {
    expect(textsQuery(escapeLucene('x) OR (mediatype:audio'))).toContain('(x\\) OR \\(mediatype\\:audio)');
  });
});

describe('toItemCard', () => {
  it('normalizes loose archive.org docs', () => {
    expect(
      toItemCard({ identifier: 'abc', title: ['Mahabharata'], date: '1955-01-01T00:00:00Z', downloads: 42, mediatype: 'texts' }),
    ).toMatchObject({ identifier: 'abc', title: 'Mahabharata', year: 1955, date: '1955-01-01', downloads: 42, isCollection: false });
    expect(toItemCard({ title: 'no id' })).toBeNull();
  });

  it('accepts real identifiers and rejects unsafe ones', () => {
    expect(isSafeIdentifier('bwb_KS-179-237')).toBe(true);
    expect(isSafeIdentifier('../etc')).toBe(false);
  });
});

describe('languageClause', () => {
  it('matches every spelling archive.org uses for a language', () => {
    expect(languageClause('hin')).toBe(' AND language:("hin" OR "Hindi")');
    expect(textsQuery('gita', 'san')).toMatch(/AND language:\("san" OR "Sanskrit"\)$/);
  });

  it('ignores missing or unknown codes rather than injecting them', () => {
    expect(languageClause(undefined)).toBe('');
    expect(languageClause('xx) OR (mediatype:audio')).toBe('');
  });
});
