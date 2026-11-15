'use client';

import { ExternalLink, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import { cn } from '@/lib/cn';
import { fieldClass, SidePanel } from './SidePanel';

interface MwEntry {
  headword: string;
  via: 'exact' | 'ending' | 'grammar' | 'cologne' | 'compound';
  senses: string[];
  url: string;
}

interface WiktionarySense {
  lang: 'hi' | 'sa' | 'mr' | 'ne';
  partOfSpeech: string;
  definitions: string[];
  lemma?: string;
  url: string;
}

interface GrammarSegment {
  form: string;
  lemma: string;
  grammar: string;
  gloss: string;
}

interface LookupResult {
  query: string;
  word: string;
  sanskrit: MwEntry[];
  grammar: GrammarSegment[];
  wiktionary: WiktionarySense[];
}

const LANG: Record<WiktionarySense['lang'], string> = { hi: 'Hindi', sa: 'Sanskrit', mr: 'Marathi', ne: 'Nepali' };

function viaLabel(e: MwEntry, word: string): string | null {
  if (e.via === 'exact') return null;
  if (e.via === 'compound') return `First part of ${word}`;
  if (e.via === 'cologne') return `Closest headword to ${word}`;
  if (e.via === 'grammar') return `Dictionary form of a part of ${word}, from its grammar`;
  return `Dictionary form of ${word}`;
}

/**
 * Word lookup: Monier-Williams for Sanskrit, Wiktionary for Hindi. `request` changes whenever the
 * reader asks for a word (double-click on the page, a word in a highlight, the L key).
 */
export function LookupPanel({ request, onClose }: { request: { word: string; n: number } | null; onClose: () => void }) {
  const [q, setQ] = useState(request?.word ?? '');
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const run = async (word: string) => {
    const n = ++seq.current;
    if (!word.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api<LookupResult>(`/api/lookup?${new URLSearchParams({ q: word.trim() })}`);
      if (n === seq.current) setResult(data);
    } catch (e) {
      if (n === seq.current) setError(e instanceof Error ? e.message : 'Lookup failed.');
    } finally {
      if (n === seq.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!request?.word) return;
    setQ(request.word);
    void run(request.word);
    // A new request object means a new lookup (run is recreated each render on purpose).
  }, [request]);

  const nothing = result && !result.sanskrit.length && !result.wiktionary.length && !result.grammar.length;
  return (
    <SidePanel title="Look up" onClose={onClose}>
      <form
        className="border-b border-rule p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void run(q);
        }}
      >
        <label htmlFor="lookup-q" className="sr-only">
          Word
        </label>
        <div className="relative">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
          <input id="lookup-q" autoFocus={!request} value={q} onChange={(e) => setQ(e.target.value)} placeholder="धर्म, dharma, विभूति…" className={cn(fieldClass, 'pl-9')} autoComplete="off" spellCheck={false} />
        </div>
        <p className="mt-2 text-sm text-ink-faint">Double-click a word on the page, or type one in Devanagari or Roman letters.</p>
      </form>
      <div className="min-h-0 flex-1 overflow-y-auto p-4" aria-live="polite" aria-busy={loading}>
        {loading ? <p className="text-sm text-ink-soft">Looking up {q.trim()}…</p> : null}
        {error ? <p className="text-sm text-danger">{error}</p> : null}
        {!loading && nothing ? (
          <p className="text-sm text-ink-soft">
            {result.word} isn’t in Monier-Williams or Wiktionary. Verb forms and some compounds can’t be traced to their dictionary form yet; try the stem or the first part of the word.
          </p>
        ) : null}
        {!loading && result ? (
          <div className="space-y-6">
            {result.word !== result.query.trim() && !nothing ? <p className="text-sm text-ink-faint">Looked up as {result.word}</p> : null}
            {result.grammar.length ? (
              <section aria-labelledby="gr-h">
                <h3 id="gr-h" className="text-sm text-ink-faint">
                  Grammar, Sanskrit Heritage
                </h3>
                <ol className="mt-2 space-y-2">
                  {result.grammar.map((g, i) => (
                    <li key={i} className="text-ink">
                      <span className="font-title text-lg">{g.form}</span>
                      {g.lemma !== g.form ? (
                        <>
                          {' '}
                          from{' '}
                          <button
                            type="button"
                            onClick={() => {
                              setQ(g.lemma);
                              void run(g.lemma);
                            }}
                            className="font-title text-lg text-accent underline-offset-4 hover:underline"
                            title={`Look up ${g.lemma}`}
                          >
                            {g.lemma}
                          </button>
                        </>
                      ) : null}
                      <span className="block text-sm text-ink-soft">{g.gloss || g.grammar}</span>
                    </li>
                  ))}
                </ol>
                <p className="mt-1 text-xs text-ink-faint">Analysed as Sanskrit; ignore it for a Hindi word.</p>
              </section>
            ) : null}
            {result.sanskrit.length ? (
              <section aria-labelledby="mw-h">
                <h3 id="mw-h" className="text-sm text-ink-faint">
                  Sanskrit, Monier-Williams
                </h3>
                {result.sanskrit.map((e) => (
                  <MwEntryView key={e.headword} entry={e} word={result.word} />
                ))}
              </section>
            ) : null}
            {result.wiktionary.length ? (
              <section aria-labelledby="wk-h">
                <h3 id="wk-h" className="text-sm text-ink-faint">
                  Wiktionary
                </h3>
                {result.wiktionary.map((s, i) => (
                  <div key={i} className="mt-3">
                    <p className="text-sm text-ink-soft">
                      {LANG[s.lang]}, {s.partOfSpeech.toLowerCase()}
                    </p>
                    <ol className="mt-1 list-decimal space-y-1 pl-5 text-ink">
                      {s.definitions.slice(0, 6).map((d, j) => (
                        <li key={j}>{d}</li>
                      ))}
                    </ol>
                  </div>
                ))}
                <a href={result.wiktionary[0]!.url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-accent hover:underline">
                  Open in Wiktionary <ExternalLink aria-hidden className="size-3.5" />
                </a>
              </section>
            ) : null}
          </div>
        ) : null}
      </div>
    </SidePanel>
  );
}

function MwEntryView({ entry: e, word }: { entry: MwEntry; word: string }) {
  const [all, setAll] = useState(false);
  const via = viaLabel(e, word);
  const senses = all ? e.senses : e.senses.slice(0, 5);
  return (
    <article className="mt-3">
      <p className="font-title text-2xl text-ink">{e.headword}</p>
      {via ? <p className="text-sm text-ink-faint">{via}</p> : null}
      <ol className="mt-2 space-y-2 text-ink">
        {senses.map((s, i) => (
          <li key={i} className="max-w-[60ch] leading-relaxed">
            {s}
          </li>
        ))}
      </ol>
      <div className="mt-2 flex items-center gap-4 text-sm">
        {e.senses.length > 5 ? (
          <button type="button" onClick={() => setAll((v) => !v)} className="text-ink-soft underline-offset-4 hover:text-ink hover:underline">
            {all ? 'Show fewer' : `Show all ${e.senses.length}`}
          </button>
        ) : null}
        <a href={e.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
          Open in Cologne <ExternalLink aria-hidden className="size-3.5" />
        </a>
      </div>
    </article>
  );
}
