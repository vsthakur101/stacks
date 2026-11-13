'use client';

import { FolderOpen, SquareArrowOutUpRight } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/client/api';

/** Compact Open / Show in Finder for Library tiles and rows. */
export function FileButtons({ target, multiple }: { target: { identifier: string } | { file: string }; multiple?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const run = (action: 'open' | 'reveal') => () => {
    setError(null);
    api('/api/open', { body: { ...target, action } }).catch((e: Error) => setError(e.message));
  };
  return (
    <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
      <button type="button" onClick={run('open')} className="-my-2 inline-flex min-h-10 items-center gap-1.5 text-accent hover:underline">
        <SquareArrowOutUpRight aria-hidden className="size-3.5" />
        {multiple ? 'Open folder' : 'Open'}
      </button>
      <button type="button" onClick={run('reveal')} className="-my-2 inline-flex min-h-10 items-center gap-1.5 text-ink-soft hover:text-ink">
        <FolderOpen aria-hidden className="size-3.5" />
        Show in Finder
      </button>
      {error ? <span className="w-full text-danger">{error}</span> : null}
    </span>
  );
}
