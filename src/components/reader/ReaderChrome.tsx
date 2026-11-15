'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useRef } from 'react';

/** The reader's thin top bar: back, title, and whatever controls the format needs. */
export function ReaderBar({ title, backHref, backLabel = 'Library', children }: { title: string; backHref: string; backLabel?: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-rule bg-panel px-3 sm:px-5">
      <Link href={backHref} className="-ml-1 inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm text-ink-soft hover:bg-raised hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        <span className="hidden sm:inline">{backLabel}</span>
      </Link>
      <h1 className="font-title min-w-0 flex-1 truncate text-[1.02rem] text-ink">{title}</h1>
      <div className="flex shrink-0 items-center gap-1 text-sm">{children}</div>
    </div>
  );
}

/** Saves the reading position at most every 800 ms, and once more when leaving the page. */
export function useSaveProgress(file: string) {
  const state = globalThis as unknown as { __stacksProgressTimer?: ReturnType<typeof setTimeout> };
  return useCallback((page: number, total: number) => {
    clearTimeout(state.__stacksProgressTimer);
    const send = () =>
      fetch('/api/progress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, page, total }),
        keepalive: true,
      }).catch(() => undefined);
    state.__stacksProgressTimer = setTimeout(send, 800);
  }, [file]); // eslint-disable-line react-hooks/exhaustive-deps
}

const TICK_MS = 15_000;
const IDLE_MS = 2 * 60_000;
const FLUSH_MS = 60_000;

/**
 * Counts reading time for the Reading page: 15 s ticks while the page is visible and something
 * happened in the last two minutes (a key, a click, scrolling, a page turn, speech). New pages reached
 * this visit count as pages read. Sent every minute and when leaving.
 */
export function useReadingTimer(file: string, page?: number, busy = false) {
  const lastActive = useRef(Date.now());
  const pending = useRef({ seconds: 0, pages: 0 });
  const seen = useRef(new Set<number>());
  const busyRef = useRef(busy);
  busyRef.current = busy;

  useEffect(() => {
    const touch = () => (lastActive.current = Date.now());
    const events = ['keydown', 'pointerdown', 'wheel', 'scroll', 'touchstart'] as const;
    for (const e of events) window.addEventListener(e, touch, { passive: true, capture: true });
    const flush = () => {
      const { seconds, pages } = pending.current;
      if (!seconds && !pages) return;
      pending.current = { seconds: 0, pages: 0 };
      void fetch('/api/reading-time', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file, seconds: Math.min(seconds, 120), pages: Math.min(pages, 100) }),
        keepalive: true,
      }).catch(() => undefined);
    };
    const tick = setInterval(() => {
      const active = busyRef.current || Date.now() - lastActive.current < IDLE_MS;
      if (document.visibilityState === 'visible' && active) pending.current.seconds += TICK_MS / 1000;
    }, TICK_MS);
    const send = setInterval(flush, FLUSH_MS);
    const hide = () => document.visibilityState === 'hidden' && flush();
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', flush);
    return () => {
      for (const e of events) window.removeEventListener(e, touch, { capture: true });
      clearInterval(tick);
      clearInterval(send);
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', flush);
      flush();
    };
  }, [file]);

  useEffect(() => {
    if (page === undefined) return;
    lastActive.current = Date.now();
    if (seen.current.size === 0) {
      seen.current.add(page); // the page you open on isn't one you read yet
      return;
    }
    if (!seen.current.has(page)) {
      seen.current.add(page);
      pending.current.pages++;
    }
  }, [page]);
}
