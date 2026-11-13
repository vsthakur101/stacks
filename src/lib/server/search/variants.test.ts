import { beforeEach, describe, expect, it, vi } from 'vitest';

const google = vi.fn<(url: string) => unknown>();
vi.mock('../http', () => ({
  TTL: { transliteration: 1 },
  getJson: async (url: string, _ttl: number, parse: (raw: unknown) => unknown) => ({ data: parse(google(url)), stale: false }),
}));

const { devanagariToLatin, devanagariVariants, expandQuery, latinVariants, looksIndic } = await import('./variants');

const reply = (word: string, deva: string) => ['SUCCESS', [[word, [deva], [], { candidate_type: [0] }]]];

beforeEach(() => {
  google.mockReset();
  google.mockImplementation((url: string) => {
    const word = new URL(url).searchParams.get('text')!;
    const table: Record<string, string> = { mahabharat: 'महाभारत', gita: 'गीता', geeta: 'गीता', ramayan: 'रामायण', durga: 'दुर्गा' };
    return reply(word, table[word] ?? word);
  });
});

describe('latinVariants', () => {
  it('toggles the final a and long vowels', () => {
    expect(latinVariants('mahabharat')).toContain('mahabharata');
    expect(latinVariants('ramayana')).toContain('ramayan');
    expect(latinVariants('geeta')).toContain('gita');
    expect(latinVariants('gita')).toContain('geeta');
  });

  it('does not chop a final a after a consonant cluster', () => {
    expect(latinVariants('durga')).not.toContain('durg');
    expect(latinVariants('krishna')).not.toContain('krishn');
    expect(latinVariants('shiva')).toContain('shiv');
    expect(latinVariants('bhagavata')).toContain('bhagavat');
  });

  it('uses alias groups for spellings rules cannot derive', () => {
    expect(latinVariants('bhagwat')).toEqual(expect.arrayContaining(['bhagavad', 'bhagavat']));
  });
});

describe('Devanagari to Roman', () => {
  it('romanises casually, with and without the final a', () => {
    expect(devanagariToLatin('महाभारत')).toEqual(['mahabharata', 'mahabharat']);
    expect(devanagariToLatin('रामायण')).toEqual(['ramayana', 'ramayan']);
    expect(devanagariToLatin('गीता')).toEqual(['gita']);
    expect(devanagariToLatin('गीता', true)).toEqual(['geeta']);
    expect(devanagariToLatin('ज्ञान')).toEqual(['gyana', 'gyan']);
  });

  it('adds the halant and long-vowel forms', () => {
    expect(devanagariVariants('उपनिषद्')).toEqual(expect.arrayContaining(['upanishad', 'उपनिषद']));
    expect(devanagariVariants('गीता')).toEqual(expect.arrayContaining(['gita', 'geeta']));
  });
});

describe('looksIndic', () => {
  it('leaves English words alone but keeps Indic words found in the dictionary', () => {
    expect(looksIndic('pride')).toBe(false);
    expect(looksIndic('magazine')).toBe(false);
    expect(looksIndic('mahabharat')).toBe(true);
    expect(looksIndic('krishna')).toBe(true);
  });
});

describe('expandQuery', () => {
  it('ORs each word with its spellings and ANDs the words', async () => {
    const e = await expandQuery('durga saptashati');
    expect(e.added).toEqual(expect.arrayContaining(['दुर्गा', 'saptasati']));
    expect(e.lucene).toMatch(/^\(durga OR दुर्गा[^)]*\) AND \(saptashati OR /);
    expect(e.ol).toMatch(/^\(durga OR दुर्गा[^)]*\) \(saptashati OR /);
  });

  it('leaves English searches exactly as typed and never asks Google about them', async () => {
    const e = await expandQuery('Pride and Prejudice');
    expect(e.added).toEqual([]);
    expect(e.lucene).toBe('Pride AND and AND Prejudice');
    expect(google).not.toHaveBeenCalled();
  });

  it('respects exact mode, removed variants and non-Devanagari languages', async () => {
    expect((await expandQuery('mahabharat', { exact: true })).added).toEqual([]);
    expect((await expandQuery('mahabharat', { excluded: ['महाभारत'] })).added).not.toContain('महाभारत');
    const tamil = await expandQuery('mahabharat', { lang: 'tam' });
    expect(tamil.added).toContain('mahabharata');
    expect(tamil.added).not.toContain('महाभारत');
  });

  it('keeps searching when Google is unreachable', async () => {
    google.mockImplementation(() => {
      throw new Error('offline');
    });
    const e = await expandQuery('mahabharat');
    expect(e.added).toEqual(['mahabharata']);
  });

  it('escapes search syntax inside words', async () => {
    const e = await expandQuery('title:(x) OR y', { exact: true });
    expect(e.lucene).toBe('title\\:\\(x AND or AND y');
  });
});
