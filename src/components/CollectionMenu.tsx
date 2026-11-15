'use client';

import { FolderPlus, Pencil, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import { cn } from '@/lib/cn';

export interface CollectionOption {
  id: string;
  name: string;
}

/**
 * "Collections" on a Library tile or file row: tick the collections it belongs in, or start a new
 * one. A <details> popover, closed by an outside click or Escape.
 */
export function CollectionMenu({ itemRef, all, member }: { itemRef: string; all: CollectionOption[]; member: string[] }) {
  const router = useRouter();
  const ref = useRef<HTMLDetailsElement>(null);
  const [inSet, setInSet] = useState(new Set(member));
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setInSet(new Set(member)), [member]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onDown = (e: PointerEvent) => el.open && !el.contains(e.target as Node) && el.removeAttribute('open');
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && el.open && el.removeAttribute('open');
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  async function toggle(id: string, on: boolean) {
    setError(null);
    setInSet((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
    try {
      await api(`/api/collections/${id}/members`, { body: { ref: itemRef, member: on } });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t change that.');
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError(null);
    try {
      await api('/api/collections', { body: { name: name.trim(), ref: itemRef } });
      setName('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t create it.');
    }
  }

  return (
    <details ref={ref} className="relative">
      <summary className="-my-2 inline-flex min-h-10 cursor-pointer list-none items-center gap-1.5 text-sm text-ink-soft hover:text-ink [&::-webkit-details-marker]:hidden">
        <FolderPlus aria-hidden className="size-3.5" />
        {inSet.size ? `In ${inSet.size} ${inSet.size === 1 ? 'collection' : 'collections'}` : 'Add to collection'}
      </summary>
      <div className="menu-panel absolute left-0 z-30 mt-1 w-64 rounded-md border border-rule bg-panel p-2 text-sm shadow-[0_12px_32px_-12px_rgb(0_0_0/0.45)]">
        {all.length ? (
          <ul className="max-h-56 overflow-y-auto">
            {all.map((c) => (
              <li key={c.id}>
                <label className="flex min-h-10 cursor-pointer items-center gap-2.5 rounded-md px-2 hover:bg-raised">
                  <input type="checkbox" checked={inSet.has(c.id)} onChange={(e) => void toggle(c.id, e.target.checked)} className="size-4 accent-[var(--accent)]" />
                  <span className="min-w-0 truncate text-ink">{c.name}</span>
                </label>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-2 py-1.5 text-ink-soft">No collections yet.</p>
        )}
        <form onSubmit={create} className="mt-1 flex gap-1.5 border-t border-rule pt-2">
          <label htmlFor={`new-${itemRef}`} className="sr-only">
            New collection
          </label>
          <input id={`new-${itemRef}`} value={name} onChange={(e) => setName(e.target.value)} placeholder="New collection" maxLength={80} className="min-w-0 flex-1 rounded-md border border-rule bg-paper px-2 py-1.5 text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none" />
          <button type="submit" disabled={!name.trim()} className="shrink-0 rounded-full bg-accent px-3 text-accent-ink disabled:opacity-40">
            Add
          </button>
        </form>
        {error ? <p className="mt-1.5 px-1 text-danger">{error}</p> : null}
      </div>
    </details>
  );
}

/** Rename or delete the collection being shown. Deleting keeps the books. */
export function CollectionTools({ id, name, count }: { id: string; name: string; count: number }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function rename(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api(`/api/collections/${id}`, { method: 'PATCH', body: { name: value } });
      setEditing(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t rename it.');
    }
  }

  async function remove() {
    await api(`/api/collections/${id}`, { method: 'DELETE', body: {} }).catch(() => undefined);
    router.push('/library');
    router.refresh();
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-2">
      {editing ? (
        <form onSubmit={rename} className="flex items-center gap-2">
          <label htmlFor="collection-name" className="sr-only">
            Collection name
          </label>
          <input id="collection-name" autoFocus value={value} onChange={(e) => setValue(e.target.value)} maxLength={80} className="font-title rounded-md border border-rule bg-paper px-2 py-1 text-xl text-ink focus:border-accent focus:outline-none" />
          <button type="submit" className="rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-ink">
            Save
          </button>
          <button type="button" onClick={() => setEditing(false)} className="text-sm text-ink-soft hover:text-ink">
            Cancel
          </button>
        </form>
      ) : (
        <h2 className="font-title text-2xl text-ink">
          {name} <span className="text-base text-ink-soft">({count})</span>
        </h2>
      )}
      {!editing ? (
        <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
          <Pencil aria-hidden className="size-3.5" /> Rename
        </button>
      ) : null}
      {confirm ? (
        <span className="inline-flex items-center gap-2 text-sm">
          Delete “{name}”? The books stay in your Library.
          <button type="button" onClick={() => void remove()} className={cn('rounded-full bg-danger px-3 py-1 font-medium text-white')}>
            Delete
          </button>
          <button type="button" onClick={() => setConfirm(false)} className="text-ink-soft hover:text-ink">
            Keep
          </button>
        </span>
      ) : (
        <button type="button" onClick={() => setConfirm(true)} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-danger">
          <Trash2 aria-hidden className="size-3.5" /> Delete collection
        </button>
      )}
      {error ? <span className="w-full text-sm text-danger">{error}</span> : null}
    </div>
  );
}
