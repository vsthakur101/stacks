import { z } from 'zod';
import { getJson, TTL } from '../http';
import { htmlToText } from './sanskrit';

/**
 * English Wiktionary's definition API: Hindi meanings (not in Monier-Williams) and some Sanskrit.
 * Inflected or variant forms ("masculine nominative singular of भगवत्", "alternative spelling of
 * भगवान") name their lemma, which the caller can follow.
 */

export const WIKTIONARY_LANGS = { hi: 'Hindi', sa: 'Sanskrit', mr: 'Marathi', ne: 'Nepali' } as const;
export type WiktionaryLang = keyof typeof WIKTIONARY_LANGS;

export interface WiktionarySense {
  lang: WiktionaryLang;
  partOfSpeech: string;
  definitions: string[];
  /** Set when every definition only points at another form (the lemma). */
  lemma?: string;
  url: string;
}

const schema = z.record(
  z.string(),
  z.array(z.object({ partOfSpeech: z.string(), definitions: z.array(z.object({ definition: z.string() })) })),
);

const FORM_OF_LINK = /class="form-of-definition-link"[\s\S]*?title="([^"#]+)"/;

export const wiktionaryUrl = (word: string) => `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`;

export function parseWiktionary(raw: unknown, word: string): WiktionarySense[] {
  const data = schema.parse(raw);
  const out: WiktionarySense[] = [];
  for (const lang of Object.keys(WIKTIONARY_LANGS) as WiktionaryLang[]) {
    for (const entry of data[lang] ?? []) {
      const lemmas = new Set<string>();
      let onlyFormOf = true;
      const definitions = entry.definitions
        .map((d) => {
          const formOf = d.definition.includes('form-of-definition') ? FORM_OF_LINK.exec(d.definition)?.[1] : undefined;
          if (formOf) lemmas.add(formOf);
          else onlyFormOf = false;
          return htmlToText(d.definition);
        })
        .filter(Boolean);
      if (!definitions.length) continue;
      out.push({
        lang,
        partOfSpeech: entry.partOfSpeech,
        definitions,
        ...(onlyFormOf && lemmas.size === 1 && ![...lemmas][0]!.startsWith('Appendix') ? { lemma: [...lemmas][0] } : {}),
        url: wiktionaryUrl(word),
      });
    }
  }
  return out;
}

export async function lookupWiktionary(word: string): Promise<WiktionarySense[]> {
  const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`;
  try {
    return (await getJson(url, TTL.dictionary, (raw) => parseWiktionary(raw, word), { timeoutMs: 8000 })).data;
  } catch {
    return []; // 404: no page for this word
  }
}
