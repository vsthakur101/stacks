'use client';

import { useState } from 'react';
import { api } from '@/lib/client/api';

/** Open file / Show in Finder for an item that's already downloaded. */
export function FileActions({ identifier, multiple }: { identifier: string; multiple: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const run = (action: 'open' | 'reveal') => () => {
    setError(null);
    api('/api/open', { body: { identifier, action } }).catch((e: Error) => setError(e.message));
  };
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={run('open')}
        className="rounded-full bg-accent px-6 py-2.5 text-sm font-medium text-accent-ink hover:opacity-90"
      >
        {multiple ? 'Open folder' : 'Open file'}
      </button>
      <button
        type="button"
        onClick={run('reveal')}
        className="rounded-full border border-ink/25 px-5 py-2.5 text-sm text-ink hover:border-accent hover:text-accent"
      >
        Show in Finder
      </button>
      {error ? <p className="w-full text-sm text-danger">{error}</p> : null}
    </div>
  );
}
