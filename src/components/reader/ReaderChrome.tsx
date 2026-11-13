'use client';

import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { useCallback } from 'react';

/** The reader's thin top bar: back, title, and whatever controls the format needs. */
export function ReaderBar({ title, backHref, children }: { title: string; backHref: string; children?: React.ReactNode }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b border-rule bg-panel px-3 sm:px-5">
      <Link href={backHref} className="-ml-1 inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm text-ink-soft hover:bg-raised hover:text-ink">
        <ArrowLeft aria-hidden className="size-4" />
        <span className="hidden sm:inline">Library</span>
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
