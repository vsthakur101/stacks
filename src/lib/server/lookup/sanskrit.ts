import { z } from 'zod';
import { getCached, getJson, TTL } from '../http';

/**
 * Monier-Williams through the Cologne Digital Sanskrit Dictionaries. MW is keyed by stems and roots,
 * but words on a page are inflected (धर्मक्षेत्रे, युयुत्सवः). So: the word itself, then the stems its
 * case ending suggests, then Cologne's own simple search, then the longest leading part that is a
 * headword (first member of a compound). Verb forms are out of scope.
 */

const BASE = 'https://www.sanskrit-lexicon.uni-koeln.de/scans/csl-apidev';

export type FoundVia = 'exact' | 'ending' | 'cologne' | 'compound';

export interface MwEntry {
  headword: string;
  via: FoundVia;
  /** One line per record in MW: the meanings, in the dictionary's order. */
  senses: string[];
  url: string;
}

const CONSONANT = /[क-हक़-य़]$/;

/** [ending, replacement] for common nominal case endings, longest first. */
const ENDINGS: [string, string][] = [
  ['ाभ्याम्', ''], ['ेभ्यः', ''], ['ाणाम्', ''], ['ानाम्', ''], ['ीनाम्', 'ि'], ['ूनाम्', 'ु'],
  ['वान्', 'वत्'], ['मान्', 'मत्'], ['ेषु', ''], ['ासु', 'ा'], ['स्य', ''], ['ानि', ''], ['ाणि', ''],
  ['ान्', ''], ['ात्', ''], ['ाय', ''], ['ेन', ''], ['ेण', ''], ['ैः', ''], ['ाः', ''], ['ाम्', 'ा'],
  ['ुम्', 'ु'], ['िम्', 'ि'], ['ोः', 'ु'], ['ेः', 'ि'], ['वः', 'ु'], ['यः', 'ि'], ['वे', 'ु'], ['ये', 'ि'],
  ['म्', ''], ['ं', ''], ['ः', ''], ['े', ''], ['ौ', ''], ['ा', ''],
];

/** Stems a Devanagari word may be an inflection of, most likely first; never the word itself. */
export function stemCandidates(word: string): string[] {
  const out: string[] = [];
  for (const [ending, replacement] of ENDINGS) {
    if (!word.endsWith(ending)) continue;
    const base = word.slice(0, -ending.length);
    if ([...base].length < 2) continue;
    // A vowel sign can only follow a consonant.
    if (/^[ा-ौ]/.test(replacement) && !CONSONANT.test(base)) continue;
    out.push(base + replacement);
  }
  return [...new Set(out)].filter((w) => w !== word);
}

/** Leading parts of a word at letter (akshara) boundaries, longest first, at least two letters. */
export function leadingParts(word: string): string[] {
  const chars = [...word];
  const bounds: number[] = [];
  for (let i = 1; i < chars.length; i++) {
    const starts = /[ऄ-औक-हक़-य़]/.test(chars[i]!) && chars[i - 1] !== '्';
    if (starts) bounds.push(i);
  }
  return bounds
    .filter((_, n) => n >= 1)
    .reverse()
    .map((i) => chars.slice(0, i).join(''));
}

const ENTITIES: Record<string, string> = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'" };

export function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+|#39);/gi, (all, name: string) => {
      if (ENTITIES[name]) return ENTITIES[name]!;
      if (name.startsWith('#x')) return String.fromCodePoint(parseInt(name.slice(2), 16));
      if (name.startsWith('#')) return String.fromCodePoint(Number(name.slice(1)));
      return all;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parses a getword.php page. Null when the key isn't a headword. */
export function parseMw(html: string): { headword: string; senses: string[] } | null {
  if (!/<table class='display'>/.test(html)) return null;
  const headword = htmlToText(/<h1>([\s\S]*?)<\/h1>/.exec(html)?.[1] ?? '');
  const senses = [...html.matchAll(/<td class='display'[^>]*>([\s\S]*?)<\/td>/g)]
    .map((m) =>
      htmlToText(m[1]!)
        .replace(/\[\s*Printed book page[^\]]*\]/g, '')
        .replace(/\[\s*ID=\d+\s*\]/g, '')
        .replace(/^\(H\d[A-Z]?\)\s*/, '')
        .trim(),
    )
    .filter(Boolean);
  // Drop bare cross-references ("भगवत् &c. See p. 743, col. 3.") when there are real senses.
  const real = senses.filter((x) => !/^\S+\s+&c\.\s+See p\.\s*\d+/.test(x));
  return headword && senses.length ? { headword, senses: real.length ? real : senses } : null;
}

export const mwUrl = (key: string) => `${BASE}/getword.php?${new URLSearchParams({ dict: 'mw', key, input: 'deva', output: 'deva' })}`;

async function mw(key: string): Promise<{ headword: string; senses: string[] } | null> {
  try {
    return (await getCached(mwUrl(key), TTL.dictionary, parseMw, { accept: 'text/html', timeoutMs: 8000 })).data;
  } catch {
    return null;
  }
}

const simpleSchema = z.object({ result: z.array(z.object({ dicthwoutput: z.string() })) });

/** Cologne's simple search: forgiving about spelling and some endings. Headwords in Devanagari. */
async function cologneSimple(word: string): Promise<string[]> {
  const url = `${BASE}/simple-search/v1.1/getword_list_1.0.php?${new URLSearchParams({ key: word, input: 'deva', output: 'deva', dict: 'mw', input_simple: 'deva' })}`;
  try {
    const { data } = await getJson(url, TTL.dictionary, (raw) => simpleSchema.parse(raw), { timeoutMs: 8000 });
    return data.result.map((r) => r.dicthwoutput);
  } catch {
    return [];
  }
}

/** Looks a Devanagari word up in Monier-Williams. */
export async function lookupSanskrit(word: string): Promise<MwEntry[]> {
  const entry = (key: string, via: FoundVia, found: { headword: string; senses: string[] }): MwEntry => ({ ...found, via, url: mwUrl(key) });

  const direct = [word, ...stemCandidates(word)];
  const results = await Promise.all(direct.map((k) => mw(k)));
  const hits = results.flatMap((r, i) => (r ? [entry(direct[i]!, i === 0 ? 'exact' : 'ending', r)] : []));
  if (hits.length) return dedupe(hits);

  for (const headword of (await cologneSimple(word)).slice(0, 2)) {
    const r = await mw(headword);
    if (r) hits.push(entry(headword, 'cologne', r));
  }
  if (hits.length) return dedupe(hits);

  const parts = leadingParts(word).slice(0, 4);
  const partResults = await Promise.all(parts.map((k) => mw(k)));
  const first = partResults.findIndex(Boolean);
  return first === -1 ? [] : [entry(parts[first]!, 'compound', partResults[first]!)];
}

function dedupe(entries: MwEntry[]): MwEntry[] {
  const seen = new Set<string>();
  return entries.filter((e) => !seen.has(e.headword) && seen.add(e.headword));
}
