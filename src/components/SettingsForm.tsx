'use client';

import { useState } from 'react';
import { api } from '@/lib/client/api';

interface Settings {
  downloadRoot: string;
  concurrency: number;
}

export function SettingsForm({ initial }: { initial: Settings }) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState<{ kind: 'idle' | 'saving' | 'saved' } | { kind: 'error'; message: string }>({ kind: 'idle' });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setStatus({ kind: 'saving' });
    try {
      const saved = await api<Settings>('/api/settings', { method: 'PUT', body: value });
      setValue(saved);
      setStatus({ kind: 'saved' });
    } catch (err) {
      setStatus({ kind: 'error', message: (err as Error).message });
    }
  }

  return (
    <form onSubmit={save} className="max-w-xl space-y-10">
      <div>
        <label htmlFor="root" className="block font-serif text-xl text-ink">
          Download folder
        </label>
        <p className="mt-1 text-sm text-ink-soft">
          Files are sorted into Books, Newspapers, Magazines, Government and Manuscripts inside it.
        </p>
        <input
          id="root"
          value={value.downloadRoot}
          onChange={(e) => setValue({ ...value, downloadRoot: e.target.value })}
          spellCheck={false}
          className="mt-3 w-full border-b-2 border-ink/60 bg-transparent py-2 text-ink focus:border-accent focus:outline-none"
        />
      </div>

      <div>
        <label htmlFor="concurrency" className="block font-serif text-xl text-ink">
          Files at once
        </label>
        <p className="mt-1 text-sm text-ink-soft">More is faster but heavier on archive.org. Three is a polite default.</p>
        <select
          id="concurrency"
          value={value.concurrency}
          onChange={(e) => setValue({ ...value, concurrency: Number(e.target.value) })}
          className="mt-3 rounded-md border border-ink/20 bg-raised px-3 py-2 text-ink"
        >
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={status.kind === 'saving'}
          className="rounded-full bg-accent px-6 py-2.5 text-sm font-medium text-accent-ink disabled:opacity-50"
        >
          Save settings
        </button>
        <p role="status" className="text-sm text-ink-soft">
          {status.kind === 'saved' ? 'Settings saved.' : status.kind === 'error' ? <span className="text-danger">{status.message}</span> : null}
        </p>
      </div>
    </form>
  );
}
