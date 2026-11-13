import { describe, expect, it } from 'vitest';
import { canonicalParams, hrefWith, parseSearch } from './params';

describe('parseSearch', () => {
  it('accepts only known sorts and languages, and caps paging', () => {
    expect(parseSearch({ q: ' gita ', sort: 'read', lang: 'san', page: '3' })).toMatchObject({ q: 'gita', sort: 'read', lang: 'san', page: 3 });
    expect(parseSearch({ q: 'x', sort: 'evil', lang: 'zz', page: '-2' })).toMatchObject({ sort: undefined, lang: undefined, page: 1 });
    expect(parseSearch({ x: ['महाभारत', 'mahabharata'], exact: '1' })).toMatchObject({ excluded: ['महाभारत', 'mahabharata'], exact: true });
  });
});

describe('hrefWith', () => {
  it('keeps current params, drops the page, and repeats removed spellings', () => {
    const sp = { q: 'gita', lang: 'san', page: '4', x: ['geeta'] };
    expect(hrefWith('/books', sp, { sort: 'old' })).toBe('/books?q=gita&lang=san&x=geeta&sort=old');
    expect(hrefWith('/books', sp, { x: ['geeta', 'गीता'] })).toBe('/books?q=gita&lang=san&x=geeta&x=%E0%A4%97%E0%A5%80%E0%A4%A4%E0%A4%BE');
    expect(hrefWith('/books', sp, { lang: undefined, x: undefined })).toBe('/books?q=gita');
  });
});

describe('canonicalParams', () => {
  it('is order-independent and ignores the page', () => {
    expect(canonicalParams({ sort: 'new', q: 'gita', page: '2' })).toEqual(canonicalParams({ q: 'gita', sort: 'new' }));
  });
});
