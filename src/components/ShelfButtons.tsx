'use client';

import { Bookmark, BookmarkCheck, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/client/api';

/** Pins the current search to Home. */
export function SaveShelfButton({
  title,
  path,
  params,
}: {
  title: string;
  path: string;
  params: Record<string, string | string[] | undefined>;
}) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  async function save() {
    setState('saving');
    try {
      const clean = Object.fromEntries(Object.entries(params).filter(([k, v]) => v !== undefined && k !== 'page')) as Record<
        string,
        string | string[]
      >;
      await api('/api/shelves', { body: { title, path, params: clean } });
      setState('saved');
    } catch {
      setState('error');
    }
  }
  if (state === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
        <BookmarkCheck className="size-4 text-accent" /> Saved to Home
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={save}
      disabled={state === 'saving'}
      className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-accent disabled:opacity-50"
    >
      <Bookmark className="size-4" /> {state === 'error' ? 'Couldn’t save. Try again' : 'Save as a shelf on Home'}
    </button>
  );
}

export function RemoveShelfButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await api(`/api/shelves/${id}`, { method: 'DELETE', body: {} }).catch(() => undefined);
        router.refresh();
      }}
      aria-label={`Remove the “${title}” shelf`}
      className="rounded-full p-1.5 text-ink-faint hover:text-danger disabled:opacity-50"
    >
      <X className="size-4" />
    </button>
  );
}

export function ClearHistoryButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => {
        await api('/api/history/clear', { body: {} }).catch(() => undefined);
        router.refresh();
      }}
      className="text-ink-faint underline-offset-4 hover:text-ink hover:underline"
    >
      Clear
    </button>
  );
}
