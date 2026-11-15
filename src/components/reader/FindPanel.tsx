'use client';

import { ChevronDown, ChevronUp, Search } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import { cn } from '@/lib/cn';
import type { Rect } from '@/lib/shared/annotations';
import type { Snippet } from '@/lib/shared/textMatch';
import { fieldClass, SidePanel } from './SidePanel';

export interface BookMatch {
  page: number;
  distance: number;
  snippet: Snippet;
  rects: Rect[];
}

interface FindResponse {
  searchedFor: string[];
  matches: BookMatch[];
  truncated: boolean;
  searchable: boolean;
  pages: number;
}

/** Find state lives in the reader so matches can be outlined on the page. */
export function useFind(file: string, page: number) {
  // New results start at the first match on or after the page being read, like a browser's find.
  const pageRef = useRef(page);
  pageRef.current = page;
  const [query, setQuery] = useState('');
  const [close, setClose] = useState(true);
  const [result, setResult] = useState<FindResponse | null>(null);
  const [current, setCurrent] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const run = useCallback(
    async (q: string, closeMatches: boolean) => {
      const n = ++seq.current;
      if (!q.trim()) {
        setResult(null);
        setError(null);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const data = await api<FindResponse>(`/api/find?${new URLSearchParams({ file, q: q.trim(), close: closeMatches ? '1' : '0' })}`);
        if (n !== seq.current) return;
        setResult(data);
        // Exact matches come first, then close ones: start at the first exact match from here on.
        const here = data.matches.findIndex((m) => m.page >= pageRef.current && m.distance === 0);
        setCurrent(Math.max(0, here));
      } catch (e) {
        if (n === seq.current) setError(e instanceof Error ? e.message : 'Find failed.');
      } finally {
        if (n === seq.current) setLoading(false);
      }
    },
    [file],
  );

  // Search as you type, after a short pause.
  useEffect(() => {
    const t = setTimeout(() => void run(query, close), query.trim().length < 2 ? 0 : 350);
    return () => clearTimeout(t);
  }, [query, close, run]);

  const matches = result?.matches ?? [];
  return { query, setQuery, close, setClose, result, matches, current, setCurrent, loading, error };
}

export type FindState = ReturnType<typeof useFind>;

export function FindPanel({ find, page, onGo, onClose }: { find: FindState; page: number; onGo: (page: number) => void; onClose: () => void }) {
  const { matches, current, result } = find;
  const exact = matches.filter((m) => m.distance === 0).length;
  const list = useRef<HTMLOListElement>(null);

  const step = (dir: 1 | -1) => {
    if (!matches.length) return;
    const next = (current + dir + matches.length) % matches.length;
    find.setCurrent(next);
    onGo(matches[next]!.page);
  };

  // Keep the current result in view in the list.
  useEffect(() => {
    list.current?.querySelector(`[data-index="${current}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  const status = (() => {
    if (find.error) return <span className="text-danger">{find.error}</span>;
    if (find.loading && !result) return 'Reading the book’s text…';
    if (!find.query.trim()) return 'Type a word or a line of a verse. Roman letters find Devanagari too.';
    if (!result) return null;
    if (!result.searchable && !matches.length) return 'This scan has almost no recognised text. Contents (C) → Text recognition can read the pages on this Mac.';
    if (!matches.length) return 'No matches.';
    const close = matches.length - exact;
    return `${exact} exact${find.close ? `, ${close} close` : ''}${result.truncated ? ' (first 300)' : ''}`;
  })();

  return (
    <SidePanel title="Find in this book" onClose={onClose}>
      <form
        className="border-b border-rule p-4"
        onSubmit={(e) => {
          e.preventDefault();
          step(1);
        }}
      >
        <label htmlFor="find-q" className="sr-only">
          Find
        </label>
        <div className="flex items-center gap-1">
          <div className="relative min-w-0 flex-1">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
            <input
              id="find-q"
              autoFocus
              value={find.query}
              onChange={(e) => find.setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.shiftKey) {
                  e.preventDefault();
                  step(-1);
                }
              }}
              placeholder="धर्मक्षेत्रे, vibhuti, Bingley…"
              className={cn(fieldClass, 'pl-9')}
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <button type="button" onClick={() => step(-1)} disabled={!matches.length} aria-label="Previous match (Shift+Enter)" className="rounded-full p-2.5 text-ink-soft hover:text-ink disabled:opacity-40">
            <ChevronUp className="size-4" />
          </button>
          <button type="submit" disabled={!matches.length} aria-label="Next match (Enter)" className="rounded-full p-2.5 text-ink-soft hover:text-ink disabled:opacity-40">
            <ChevronDown className="size-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between gap-3 text-sm">
          <label className="inline-flex items-center gap-2 text-ink-soft">
            <input type="checkbox" checked={find.close} onChange={(e) => find.setClose(e.target.checked)} className="size-4 accent-[var(--accent)]" />
            Close matches
          </label>
          {matches.length ? (
            <span className="tabular-nums text-ink-soft" aria-live="polite">
              {current + 1} of {matches.length}
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-sm text-ink-soft" aria-live="polite">
          {status}
        </p>
        {result && result.searchedFor.length > 1 ? (
          <p className="mt-1 text-sm text-ink-faint">Also searching for {result.searchedFor.slice(1).join(', ')}</p>
        ) : null}
      </form>
      <ol ref={list} className="min-h-0 flex-1 divide-y divide-rule overflow-y-auto">
        {matches.map((m, i) => (
          <li key={`${m.page}-${i}`} data-index={i}>
            <button
              type="button"
              onClick={() => {
                find.setCurrent(i);
                onGo(m.page);
              }}
              aria-current={i === current ? 'true' : undefined}
              className={cn('block w-full px-4 py-3 text-left hover:bg-raised', i === current && 'bg-accent-wash')}
            >
              <span className="flex items-center gap-2 text-xs text-ink-faint">
                Page {m.page}
                {m.page === page ? ', this page' : ''}
                {m.distance > 0 ? <span className="keep-round rounded-full border border-rule px-1.5 leading-4">close</span> : null}
              </span>
              <span className="mt-1 line-clamp-3 block text-sm text-ink-soft">
                {m.snippet.before}
                <mark className="rounded-[2px] bg-[rgb(250_214_60/0.5)] px-0.5 text-ink">{m.snippet.match}</mark>
                {m.snippet.after}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </SidePanel>
  );
}
