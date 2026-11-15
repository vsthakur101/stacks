import { getCached, TTL } from '../http';
import { devanagariToSlp1 } from '@/lib/shared/slp1';
import { htmlToText } from './sanskrit';

/**
 * Sanskrit grammar from INRIA's Sanskrit Heritage "Reader Companion" (Gérard Huet): splits sandhi and
 * compounds and names each part's dictionary form (verbs included: अकुर्वत → कृ) and its grammar.
 * Input must be SLP1; the answer is HTML with segments like "[ अकुर्वत [ कृ१ ]{कर्तरि लङ् … प्र बहु} ]".
 */

const READER = 'https://sanskrit.inria.fr/cgi-bin/SKT/sktreader.cgi';

export interface GrammarSegment {
  /** The form as it stands in the text (after sandhi is undone). */
  form: string;
  /** Dictionary form (stem or verb root), without INRIA's homonym digit. */
  lemma: string;
  /** INRIA's grammar tags (Sanskrit terms), alternatives separated by " | ". */
  grammar: string;
  /** The tags in plain English. */
  gloss: string;
}

const TAGS: Record<string, string> = {
  पुं: 'masculine', स्त्री: 'feminine', नपुं: 'neuter',
  एक: 'singular', द्वि: 'dual', बहु: 'plural',
  प्र: '3rd person', म: '2nd person', उ: '1st person',
  लट्: 'present', लङ्: 'imperfect', लिट्: 'perfect', लोट्: 'imperative', 'विधिलिङ्': 'optative', आशीर्लिङ्: 'benedictive',
  लुट्: 'periphrastic future', लृट्: 'future', लृङ्: 'conditional', लुङ्: 'aorist',
  कर्तरि: 'active', कर्मणि: 'passive', पूर्वपद: 'first part of a compound', अव्य: 'indeclinable',
  क्त्वा: 'absolutive (having …)', ल्यप्: 'absolutive (having …)', तुमुन्: 'infinitive (to …)',
};
const CASES = ['', 'nominative', 'accusative', 'instrumental', 'dative', 'ablative', 'genitive', 'locative', 'vocative'];

/** "पुं 8 बहु | स्त्री 1 बहु" → "masculine vocative plural, or feminine nominative plural". */
export function glossGrammar(grammar: string): string {
  return grammar
    .split('|')
    .map((alt) =>
      alt
        .trim()
        .split(/\s+/)
        .map((t) => {
          if (/^[1-8]$/.test(t)) return CASES[Number(t)]!;
          if (TAGS[t]) return TAGS[t]!;
          // Verb class tags carry the voice: "पपभ्वादि" (parasmaipada, bhvādi), "आपतनादि" (ātmanepada, tanādi).
          if (t.startsWith('पप')) return 'parasmaipada';
          if (t.startsWith('आप')) return 'ātmanepada';
          return t;
        })
        .filter(Boolean)
        .join(' '),
    )
    .filter(Boolean)
    .join(', or ');
}

/** Parses the Reader's best (first listed) solution; it isn't always numbered 1 (others get filtered). */
export function parseHeritage(html: string): GrammarSegment[] {
  const text = htmlToText(html);
  const first = /Solution \d+\s*:/.exec(text);
  if (!first) return [];
  const rest = text.slice(first.index + first[0].length);
  const next = rest.search(/Solution \d+\s*:/);
  const solution = next === -1 ? rest : rest.slice(0, next);
  const out: GrammarSegment[] = [];
  for (const m of solution.matchAll(/\[\s*([^\s[\]]+)\s*\[\s*([^\s[\]]+)\s*\]\s*\{([^}]*)\}/g)) {
    const grammar = m[3]!.trim();
    out.push({ form: m[1]!, lemma: m[2]!.replace(/[०-९0-9]+$/, ''), grammar, gloss: glossGrammar(grammar) });
  }
  return out;
}

export async function analyseSanskrit(word: string): Promise<GrammarSegment[]> {
  const slp = devanagariToSlp1(word);
  if (slp.length < 2) return [];
  const url = `${READER}?${new URLSearchParams({ lex: 'MW', cache: 'f', st: 't', us: 'f', font: 'deva', t: 'SL', text: slp, mode: 'p' })}`;
  try {
    return (await getCached(url, TTL.dictionary, parseHeritage, { accept: 'text/html', timeoutMs: 8000 })).data;
  } catch {
    return [];
  }
}
