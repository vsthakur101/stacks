import { toDevanagari } from '../search/variants';
import { lookupSanskrit, type MwEntry } from './sanskrit';
import { lookupWiktionary, type WiktionarySense } from './wiktionary';

export interface LookupResult {
  /** As typed or selected. */
  query: string;
  /** The Devanagari word that was looked up. */
  word: string;
  sanskrit: MwEntry[];
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
  const [sanskrit, wiktionary] = await Promise.all([lookupSanskrit(single), lookupWiktionary(single)]);

  // Follow "form of X" once: Hindi variant spellings, Sanskrit inflections MW couldn't trace.
  const lemmas = [...new Set(wiktionary.flatMap((s) => (s.lemma && s.lemma !== single ? [s.lemma] : [])))].slice(0, 2);
  const followed = (await Promise.all(lemmas.map((l) => lookupWiktionary(l)))).flat().filter((s) => !s.lemma);
  if (!sanskrit.length) {
    const saLemma = wiktionary.find((s) => s.lang === 'sa' && s.lemma)?.lemma;
    if (saLemma) sanskrit.push(...(await lookupSanskrit(saLemma)).map((e) => ({ ...e, via: 'ending' as const })));
  }
  // A Hindi "alternative spelling of X" adds nothing once X's own meanings are shown. Sanskrit
  // pointers stay: "masculine nominative singular of भगवत्" is the grammar of the word on the page.
  const shown = followed.length ? wiktionary.filter((s) => !(s.lemma && s.lang !== 'sa')) : wiktionary;
  return { query, word: single, sanskrit, wiktionary: [...shown, ...followed] };
}
