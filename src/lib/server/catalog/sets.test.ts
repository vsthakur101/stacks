import { describe, expect, it } from 'vitest';
import { setPattern } from './sets';

describe('setPattern', () => {
  it('builds identifier wildcards, with five single-character wildcards for upload codes', () => {
    expect(setPattern('SivaPuranaJ.L.ShastriPart{n}')).toBe('SivaPuranaJ.L.ShastriPart*');
    expect(setPattern('mahabharata{n}ramauoft')).toBe('mahabharata*ramauoft');
    expect(setPattern('~mahabharata-vol.-{n}-translated-by-m-n-dutt')).toBe('?????mahabharata-vol.-*-translated-by-m-n-dutt');
  });

  it('refuses stems that would start with an open wildcard or carry query syntax', () => {
    expect(setPattern('{n}-gita')).toBeNull();
    expect(setPattern('x) OR (y{n}')).toBeNull();
  });
});
