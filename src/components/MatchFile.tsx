'use client';

import { Check, Link2, Search, Unlink } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client/api';

interface Candidate {
  identifier: string;
  title: string;
  creator?: string;
  year?: number;
  thumbnail: string;
  sameSize: boolean;
}

/** "Find on archive.org" for one of your own files: candidates inline, Use this links it. */
export function MatchFile({ file }: { file: string }) {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [guess, setGuess] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function find(q?: string) {
    setState('loading');
    setError(null);
    try {
      const d = await api<{ guess: string; candidates: Candidate[] }>(`/api/match?${new URLSearchParams({ file, ...(q ? { q } : {}) })}`);
      // Only the first, automatic search fills the box; never overwrite what was typed.
      if (!q) setGuess((g) => g || d.guess);
      setCandidates(d.candidates);
      setState('done');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t search archive.org.');
      setState('error');
    }
  }

  async function link(identifier: string) {
    try {
      await api('/api/match', { body: { file, identifier } });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t link it.');
    }
  }

  if (state === 'idle' || state === 'error') {
    return (
      <span className="flex flex-wrap items-center gap-x-3 text-sm">
        <button type="button" onClick={() => void find()} className="-my-2 inline-flex min-h-10 items-center gap-1.5 text-accent hover:underline">
          <Search aria-hidden className="size-3.5" /> Find on archive.org
        </button>
        {error ? <span className="text-danger">{error}</span> : null}
      </span>
    );
  }
  return (
    <div className="mt-3 w-full rounded-md border border-rule bg-raised p-3 text-sm" aria-live="polite">
      <form
        className="mb-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void find(guess);
        }}
      >
        <label htmlFor={`match-${file}`} className="sr-only">
          Search archive.org for
        </label>
        <input id={`match-${file}`} value={guess} onChange={(e) => setGuess(e.target.value)} className="min-w-0 flex-1 rounded-md border border-rule bg-paper px-2.5 py-1.5 text-ink focus:border-accent focus:outline-none" />
        <button type="submit" className="shrink-0 rounded-full border border-rule px-3 text-ink hover:bg-paper">
          Search
        </button>
      </form>
      {state === 'loading' ? (
        <p className="text-ink-soft">Searching archive.org…</p>
      ) : candidates.length === 0 ? (
        <p className="text-ink-soft">
          Nothing found. Try the title as archive.org might spell it (Vibhuti / Vibhoti), or fewer words.{' '}
          <button type="button" onClick={() => setState('idle')} className="text-accent hover:underline">
            Close
          </button>
        </p>
      ) : (
        <>
          <p className="mb-2 text-ink-soft">Pick the item this file is a copy of; nothing is renamed.</p>
          <ul className="space-y-2">
            {candidates.map((c) => (
              <li key={c.identifier} className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element -- local cover cache */}
                <img src={c.thumbnail} alt="" className="t-cover h-14 w-10 shrink-0 bg-paper object-cover" loading="lazy" />
                <span className="min-w-0 flex-1">
                  <a href={`/item/${encodeURIComponent(c.identifier)}?s=books`} target="_blank" rel="noreferrer" className="font-title block truncate text-ink hover:text-accent">
                    {c.title}
                  </a>
                  <span className="block truncate text-ink-soft">
                    {[c.creator, c.year].filter(Boolean).join(', ')}
                    {c.sameSize ? (
                      <span className="ml-1 inline-flex items-center gap-1 text-accent">
                        <Check aria-hidden className="size-3.5" /> same file size as yours
                      </span>
                    ) : null}
                  </span>
                </span>
                <button type="button" onClick={() => void link(c.identifier)} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 font-medium text-accent-ink">
                  <Link2 aria-hidden className="size-3.5" /> Use this
                </button>
              </li>
            ))}
          </ul>
          <button type="button" onClick={() => setState('idle')} className="mt-2 text-ink-soft hover:text-ink">
            None of these
          </button>
        </>
      )}
      {error ? <p className="mt-2 text-danger">{error}</p> : null}
    </div>
  );
}

/** Undo a hand-made link: the file goes back to Other files. */
export function UnlinkFile({ file }: { file: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await api('/api/match', { method: 'DELETE', body: { file } }).catch(() => undefined);
        router.refresh();
      }}
      className="-my-2 inline-flex min-h-10 items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
      title="This file was matched by hand; unlink it"
    >
      <Unlink aria-hidden className="size-3.5" /> Unlink
    </button>
  );
}
