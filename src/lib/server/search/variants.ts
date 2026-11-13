import fs from 'node:fs';
import { z } from 'zod';
import { findLanguage } from '@/lib/shared/languages';
import { getJson, TTL } from '../http';
import { escapeLucene } from '../catalog/normalize';
import { olText } from '../catalog/openLibrary';

/**
 * "One search, every spelling" (design: 2026-11-13-stacks-ease-of-use-design.md §1).
 * Indic titles are spelled many ways; archive.org and Open Library only match what you type.
 * Each query word gets a few variants, and the query becomes an AND of per-word ORs.
 */

const MAX_VARIANTS = 5;
const DEVANAGARI = /[ऀ-ॿ]/;
const LATIN_WORD = /^[a-z]+$/;

/** Indic words that also appear in the English dictionary; always treated as Indic. */
const ALWAYS_INDIC = new Set([
  'hanuman', 'krishna', 'purana', 'puranas', 'shiv', 'yoga', 'karma', 'veda', 'vedas', 'vedanta', 'tulsi', 'das',
  'rama', 'sita', 'ganga', 'mantra', 'mantras', 'guru', 'dharma', 'avatar', 'nirvana', 'yogi', 'brahma', 'brahmin',
  'buddha', 'sutra', 'sutras', 'tantra', 'raja', 'rani', 'maharaja', 'sanskrit', 'hindi', 'vishnu', 'lakshmi',
]);

/** Spellings that rules can't derive. Every word in a group is a variant of the others. */
const ALIAS_GROUPS: readonly string[][] = [
  ['bhagavad', 'bhagwad', 'bhagavat', 'bhagwat'],
  ['bhagavata', 'bhagwata', 'bhagavatam'],
  ['krishna', 'krisna', 'krushna'],
  ['vishnu', 'visnu'],
  ['upanishad', 'upanisad', 'upnishad'],
  ['upanishads', 'upanisads'],
  ['shiva', 'siva', 'shiv'],
  ['tulsidas', 'tulasidas', 'tulsi das'],
  ['ramcharitmanas', 'ramacharitamanasa', 'ramcharitmanas'],
  ['gorakhpur', 'gorakpur'],
  ['saptashati', 'saptasati', 'saptshati'],
  ['durga', 'durgaa'],
];
const ALIASES = new Map<string, string[]>();
for (const group of ALIAS_GROUPS) for (const w of group) ALIASES.set(w, group.filter((x) => x !== w));

let english: Set<string> | null = null;
/** macOS ships an English word list; on other systems every word counts as possibly Indic. */
function englishWords(): Set<string> {
  if (english) return english;
  try {
    english = new Set(fs.readFileSync('/usr/share/dict/words', 'utf8').toLowerCase().split('\n'));
  } catch {
    english = new Set();
  }
  return english;
}

export function looksIndic(word: string): boolean {
  return ALWAYS_INDIC.has(word) || !englishWords().has(word);
}

/** Romanised spelling variants: aliases, final-a on/off, ee↔i, oo↔u. */
export function latinVariants(word: string): string[] {
  const out = new Set<string>(ALIASES.get(word) ?? []);
  // Drop a final a only after a single consonant (mahabharata → mahabharat), never after a cluster
  // (durga → durg and krishna → krishn are different words or nonsense).
  if (word.length > 4 && /[aeiou](?:[bcdgjkpst]h|[^aeiouh])a$/.test(word)) out.add(word.slice(0, -1));
  if (word.length >= 4 && /[^aeiou]$/.test(word)) out.add(`${word}a`);
  if (word.includes('ee')) out.add(word.replace(/ee/g, 'i'));
  else if ((word.match(/i/g) ?? []).length === 1 && !word.endsWith('i')) out.add(word.replace('i', 'ee'));
  if (word.includes('oo')) out.add(word.replace(/oo/g, 'u'));
  out.delete(word);
  return [...out];
}

/* ------------------------- Devanagari → casual Roman ------------------------- */

const CONSONANTS: Record<string, string> = {
  क: 'k', ख: 'kh', ग: 'g', घ: 'gh', ङ: 'n', च: 'ch', छ: 'chh', ज: 'j', झ: 'jh', ञ: 'n', ट: 't', ठ: 'th', ड: 'd',
  ढ: 'dh', ण: 'n', त: 't', थ: 'th', द: 'd', ध: 'dh', न: 'n', प: 'p', फ: 'ph', ब: 'b', भ: 'bh', म: 'm', य: 'y',
  र: 'r', ल: 'l', ळ: 'l', व: 'v', श: 'sh', ष: 'sh', स: 's', ह: 'h', क़: 'q', ख़: 'kh', ग़: 'g', ज़: 'z', ड़: 'r',
  ढ़: 'rh', फ़: 'f',
};
const VOWELS: Record<string, string> = {
  अ: 'a', आ: 'a', इ: 'i', ई: 'i', उ: 'u', ऊ: 'u', ऋ: 'ri', ए: 'e', ऐ: 'ai', ओ: 'o', औ: 'au',
};
const MATRAS: Record<string, string> = {
  'ा': 'a', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au',
};
const LONG_MATRAS: Record<string, string> = { 'ी': 'ee', 'ू': 'oo' };

/** Casual Hindi-style romanisation. `long` spells ī/ū as ee/oo (geeta). Returns [with final a, without]. */
export function devanagariToLatin(word: string, long = false): string[] {
  const chars = [...word.normalize('NFC')];
  let out = '';
  let pendingA = false; // a consonant waiting for its inherent vowel
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    if (c === 'ज' && chars[i + 1] === '्' && chars[i + 2] === 'ञ') {
      if (pendingA) out += 'a';
      out += 'gy';
      pendingA = true;
      i += 2;
      continue;
    }
    if (CONSONANTS[c] !== undefined) {
      if (pendingA) out += 'a';
      out += CONSONANTS[c];
      pendingA = true;
    } else if (MATRAS[c] !== undefined) {
      out += long && LONG_MATRAS[c] ? LONG_MATRAS[c] : MATRAS[c];
      pendingA = false;
    } else if (c === '्') {
      pendingA = false;
    } else if (VOWELS[c] !== undefined) {
      if (pendingA) out += 'a';
      out += VOWELS[c];
      pendingA = false;
    } else if (c === 'ं' || c === 'ँ') {
      if (pendingA) out += 'a';
      out += 'n';
      pendingA = false;
    } else if (c === 'ः') {
      if (pendingA) out += 'a';
      out += 'h';
      pendingA = false;
    } else if (c === '़') {
      // nukta on a consonant we didn't precompose; ignore
    } else {
      return [];
    }
  }
  if (!out) return [];
  // Hindi drops the final inherent vowel in speech (महाभारत → mahabharat); titles use both.
  return pendingA ? [`${out}a`, out] : [out];
}

export function devanagariVariants(word: string): string[] {
  const out = new Set<string>([...devanagariToLatin(word), ...devanagariToLatin(word, true)]);
  // With and without a final halant: उपनिषद् / उपनिषद
  if (word.endsWith('्')) out.add(word.slice(0, -1));
  else if (/[क-ह]$/.test(word)) out.add(`${word}्`);
  out.delete(word);
  return [...out];
}

/* ------------------------- Latin → Devanagari (Google) ------------------------- */

const googleSchema = z.tuple([z.literal('SUCCESS'), z.array(z.tuple([z.string(), z.array(z.string())]).rest(z.unknown()))]).rest(z.unknown());

/** Top Devanagari candidate for a romanised word, or undefined if Google is unreachable or unsure. */
export async function toDevanagari(word: string): Promise<string | undefined> {
  const url = `https://inputtools.google.com/request?${new URLSearchParams({
    text: word,
    itc: 'hi-t-i0-und',
    num: '1',
    ie: 'utf-8',
    oe: 'utf-8',
  })}`;
  try {
    const { data } = await getJson(url, TTL.transliteration, (raw) => googleSchema.parse(raw), { timeoutMs: 3000 });
    const candidate = data[1][0]?.[1][0];
    return candidate && DEVANAGARI.test(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

/* ------------------------- query expansion ------------------------- */

export interface WordVariants {
  word: string;
  variants: string[];
}

export interface ExpandedQuery {
  words: WordVariants[];
  /** Escaped Lucene for archive.org: words ANDed, each an OR of its spellings. */
  lucene: string;
  /** Open Library query text in the same shape. */
  ol: string;
  /** Every variant that was added, in order, for the "Also searching for" chips. */
  added: string[];
}

export interface ExpandOptions {
  lang?: string;
  /** No variants at all. */
  exact?: boolean;
  /** Variants the user switched off. */
  excluded?: readonly string[];
}

/** Languages written in Devanagari; only these get Devanagari forms from Google. */
const DEVANAGARI_LANGS = new Set(['hin', 'san', 'mar', 'nep', 'kok']);

export async function expandQuery(q: string, opts: ExpandOptions = {}): Promise<ExpandedQuery> {
  const tokens = q
    .normalize('NFC')
    .split(/\s+/)
    .map((t) => t.replace(/^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu, ''))
    .filter(Boolean)
    // A typed AND/OR/NOT is a word to search for, not an operator.
    .map((t) => (/^(AND|OR|NOT)$/.test(t) ? t.toLowerCase() : t));
  const excluded = new Set(opts.excluded ?? []);
  const lang = findLanguage(opts.lang);
  const wantsDevanagari = !lang || DEVANAGARI_LANGS.has(lang.code);

  const words: WordVariants[] = await Promise.all(
    tokens.map(async (token): Promise<WordVariants> => {
      if (opts.exact || token.length < 3) return { word: token, variants: [] };
      let variants: string[] = [];
      if (DEVANAGARI.test(token)) {
        variants = devanagariVariants(token);
      } else {
        const lower = token.toLowerCase();
        if (LATIN_WORD.test(lower) && looksIndic(lower)) {
          const deva = wantsDevanagari ? await toDevanagari(lower) : undefined;
          variants = [...(deva ? [deva] : []), ...latinVariants(lower)];
        }
      }
      variants = [...new Set(variants)].filter((v) => v !== token && !excluded.has(v)).slice(0, MAX_VARIANTS);
      return { word: token, variants };
    }),
  );

  const group = (w: WordVariants, esc: (s: string) => string) =>
    w.variants.length === 0 ? esc(w.word) : `(${[w.word, ...w.variants].map(esc).join(' OR ')})`;
  const luceneTerm = (s: string) => (s.includes(' ') ? `"${escapeLucene(s)}"` : escapeLucene(s));
  const olTerm = (s: string) => {
    const clean = olText(s);
    return clean.includes(' ') ? `"${clean}"` : clean;
  };

  return {
    words,
    lucene: words.map((w) => group(w, luceneTerm)).join(' AND ') || '*',
    ol: words.map((w) => group(w, olTerm)).join(' '),
    added: [...new Set(words.flatMap((w) => w.variants))],
  };
}
