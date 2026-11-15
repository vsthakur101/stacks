'use client';

import { Download, FolderOpen, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { api } from '@/lib/client/api';

interface Count {
  added: number;
  updated: number;
}
type Summary = Record<'annotations' | 'readingProgress' | 'bookPrefs' | 'savedShelves' | 'searchHistory' | 'settings', Count>;

const LABELS: Record<keyof Summary, string> = {
  annotations: 'highlights, notes and bookmarks',
  readingProgress: 'reading positions',
  bookPrefs: 'printed-page settings',
  savedShelves: 'Home shelves',
  searchHistory: 'searches',
  settings: 'settings',
};

function describe(s: Summary): string {
  const parts = (Object.keys(LABELS) as (keyof Summary)[])
    .map((k) => {
      const { added, updated } = s[k];
      if (!added && !updated) return null;
      return `${added ? `${added} added` : ''}${added && updated ? ', ' : ''}${updated ? `${updated} updated` : ''} ${LABELS[k]}`;
    })
    .filter(Boolean);
  return parts.length ? `Restored: ${parts.join('; ')}.` : 'Nothing to restore: everything in that backup is already here.';
}

export function BackupPanel({ daily }: { daily: { dir: string; count: number; latest: number | null } }) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<{ kind: 'idle' | 'working' } | { kind: 'done' | 'error'; message: string }>({ kind: 'idle' });

  async function restore(file: File) {
    setStatus({ kind: 'working' });
    try {
      let json: unknown;
      try {
        json = JSON.parse(await file.text());
      } catch {
        throw new Error('That file isn’t a Stacks backup (not JSON).');
      }
      const summary = await api<Summary>('/api/backup', { body: json });
      setStatus({ kind: 'done', message: describe(summary) });
    } catch (e) {
      setStatus({ kind: 'error', message: e instanceof Error ? e.message : 'Restore failed.' });
    } finally {
      if (input.current) input.current.value = '';
    }
  }

  const latest = daily.latest ? new Date(daily.latest).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : null;
  return (
    <div className="max-w-xl space-y-8">
      <div>
        <p className="font-title text-xl text-ink">Your highlights, notes and reading</p>
        <p className="mt-1 text-sm text-ink-soft">
          One file with your highlights, notes, bookmarks, reading positions, printed page numbers, Home shelves, searches and settings. Books aren’t included; they stay in your download folder.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a href="/api/backup" className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink hover:opacity-90">
            <Download aria-hidden className="size-4" /> Download a backup
          </a>
          <button type="button" onClick={() => input.current?.click()} disabled={status.kind === 'working'} className="inline-flex items-center gap-2 rounded-full border border-rule px-5 py-2.5 text-sm text-ink hover:bg-raised disabled:opacity-50">
            <Upload aria-hidden className="size-4" /> Restore from a backup…
          </button>
          <input ref={input} type="file" accept="application/json,.json" className="sr-only" aria-label="Backup file to restore" onChange={(e) => e.target.files?.[0] && void restore(e.target.files[0])} />
        </div>
        <p role="status" className="mt-3 text-sm text-ink-soft">
          {status.kind === 'working' ? 'Restoring…' : status.kind === 'done' ? status.message : status.kind === 'error' ? <span className="text-danger">{status.message}</span> : 'Restoring adds what’s missing and keeps the newer copy of anything changed in both places. Nothing here is deleted.'}
        </p>
      </div>
      <div>
        <p className="font-title text-xl text-ink">Daily copies</p>
        <p className="mt-1 text-sm text-ink-soft">
          While Stacks is running it saves a copy once a day (the last 30 are kept) in a hidden folder inside your download folder, so your own backup of that folder covers them too.
          {latest ? ` Latest: ${latest}, ${daily.count} kept.` : ' The first one is saved a minute after Stacks starts.'}
        </p>
        <button type="button" onClick={() => void api('/api/reveal', { body: { backups: true } }).catch(() => undefined)} className="mt-3 inline-flex items-center gap-2 text-sm text-accent hover:underline">
          <FolderOpen aria-hidden className="size-4" /> Show in Finder
        </button>
      </div>
    </div>
  );
}
