import { toDevanagari } from '../search/variants';
import { analyseSanskrit, type GrammarSegment } from './heritage';
import { lookupSanskrit, mw, mwUrl, type MwEntry } from './sanskrit';
import { lookupWiktionary, type WiktionarySense } from './wiktionary';

export interface LookupResult {
  /** As typed or selected. */
  query: string;
  /** The Devanagari word that was looked up. */
  word: string;
  sanskrit: MwEntry[];
  /** Sandhi split and grammar of each part (Sanskrit Heritage); empty for words it can't analyse. */
  grammar: GrammarSegment[];
  wiktionary: WiktionarySense[];
}

const DEVANAGARI = /[ऀ-ॿ]/;

/** Trims what a selection drags along: punctuation, dandas, digits, verse numbers. */
export function cleanWord(q: string): string {
  return q
    .normalize('NFC')
    .replace(/[​-‍﻿]/g, '')
    .replace(/^[^\p{L}\p{M}]+|[^\p{L}\p{M}]+$/gu, '')
    .trim();
}

export async function lookupWord(query: string): Promise<LookupResult> {
  const cleaned = cleanWord(query);
  let word = cleaned;
  if (!DEVANAGARI.test(cleaned) && /^[A-Za-z\s]+$/.test(cleaned)) {
    const parts = await Promise.all(cleaned.toLowerCase().split(/\s+/).map((w) => toDevanagari(w)));
    if (parts.every(Boolean)) word = parts.join(' ');
  }
  const single = word.split(/\s+/)[0] ?? word;
  const [found, wiktionary, grammar] = await Promise.all([lookupSanskrit(single), lookupWiktionary(single), DEVANAGARI.test(single) ? analyseSanskrit(single) : Promise.resolve([])]);
  // Dictionary forms from the grammar (verb roots, sandhi split) that MW lookup didn't reach on its own.
  const known = new Set(found.map((e) => e.headword));
  const lemmas = [...new Set(grammar.map((g) => g.lemma))].filter((l) => !known.has(l)).slice(0, 3);
  const viaGrammar = (await Promise.all(lemmas.map(async (l) => ({ l, r: await mw(l) })))).flatMap(({ l, r }) => (r ? [{ ...r, via: 'grammar' as const, url: mwUrl(l) }] : []));
  const exact = found.filter((e) => e.via === 'exact');
  // With the grammar's dictionary forms in hand, the guesses (closest headword, first part of a compound) are noise.
  const guesses = viaGrammar.length ? new Set(['cologne', 'compound']) : new Set<string>();
  const sanskrit = [...exact, ...viaGrammar, ...found.filter((e) => e.via !== 'exact' && !guesses.has(e.via))];

  // Follow "form of X" once: Hindi variant spellings, Sanskrit inflections MW couldn't trace.
  const formsOf = [...new Set(wiktionary.flatMap((s) => (s.lemma && s.lemma !== single ? [s.lemma] : [])))].slice(0, 2);
  const followed = (await Promise.all(formsOf.map((l) => lookupWiktionary(l)))).flat().filter((s) => !s.lemma);
  if (!sanskrit.length) {
    const saLemma = wiktionary.find((s) => s.lang === 'sa' && s.lemma)?.lemma;
    if (saLemma) sanskrit.push(...(await lookupSanskrit(saLemma)).map((e) => ({ ...e, via: 'ending' as const })));
  }
  // A Hindi "alternative spelling of X" adds nothing once X's own meanings are shown. Sanskrit
  // pointers stay: "masculine nominative singular of भगवत्" is the grammar of the word on the page.
  const shown = followed.length ? wiktionary.filter((s) => !(s.lemma && s.lang !== 'sa')) : wiktionary;
  return { query, word: single, sanskrit, grammar, wiktionary: [...shown, ...followed] };
}
