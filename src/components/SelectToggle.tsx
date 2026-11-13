'use client';

import { Check, Loader2, Plus } from 'lucide-react';
import { useState } from 'react';
import { api } from '@/lib/client/api';
import { useIsSelected, useTray } from '@/lib/client/tray';
import { cn } from '@/lib/cn';
import type { TrayItem } from '@/lib/shared/types';

const base =
  'inline-flex size-9 items-center justify-center rounded-full border transition-colors disabled:cursor-wait pointer-coarse:size-11';

function look(selected: boolean) {
  return selected
    ? 'border-accent bg-accent text-accent-ink'
    : 'border-ink/25 bg-raised/95 text-ink-soft hover:border-accent hover:text-accent';
}

/** Adds/removes a known archive.org item from your selection. */
export function SelectToggle({ item, className, withLabel }: { item: TrayItem; className?: string; withLabel?: boolean }) {
  const selected = useIsSelected(item.identifier);
  const toggle = useTray((s) => s.toggle);
  const button = (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={selected ? `Remove “${item.title}” from your selection` : `Add “${item.title}” to your selection`}
      onClick={() => toggle(item)}
      className={cn(base, look(selected), className)}
    >
      {selected ? <Check className="size-4" strokeWidth={2.5} /> : <Plus className="size-4" />}
    </button>
  );
  return withLabel ? <SlipLabel selected={selected}>{button}</SlipLabel> : button;
}

function SlipLabel({ selected, children }: { selected: boolean; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-2 text-sm text-ink-soft">
      {children}
      {selected ? 'Selected' : 'Select'}
    </span>
  );
}

/**
 * For Open Library works: the downloadable scan isn't known until we ask archive.org for the
 * most-downloaded free scan, so we resolve on first click and remember it.
 */
export function WorkSelectToggle({
  scanIds,
  base: partial,
  className,
  withLabel,
}: {
  scanIds: string[];
  base: Omit<TrayItem, 'identifier' | 'section'>;
  className?: string;
  withLabel?: boolean;
}) {
  const [identifier, setIdentifier] = useState<string>();
  const [state, setState] = useState<'idle' | 'loading' | 'none'>('idle');
  const items = useTray((s) => s.items);
  const add = useTray((s) => s.add);
  const remove = useTray((s) => s.remove);
  const selectedId = identifier ?? items.find((i) => scanIds.includes(i.identifier))?.identifier;
  const selected = selectedId !== undefined && items.some((i) => i.identifier === selectedId);

  async function onClick() {
    if (selected && selectedId) return remove(selectedId);
    let id = identifier;
    if (!id) {
      setState('loading');
      try {
        id = (await api<{ identifier: string }>('/api/resolve-scan', { body: { scanIds } })).identifier;
        setIdentifier(id);
        setState('idle');
      } catch {
        setState('none');
        return;
      }
    }
    add([{ ...partial, identifier: id, section: 'books' }]);
  }

  if (state === 'none') {
    return <span className={cn('rounded-full bg-raised px-2 py-1 text-xs text-ink-soft', className)}>No free scan</span>;
  }
  const button = (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={selected ? `Remove “${partial.title}” from your selection` : `Add “${partial.title}” to your selection`}
      disabled={state === 'loading'}
      onClick={onClick}
      className={cn(base, look(selected), className)}
    >
      {state === 'loading' ? (
        <Loader2 className="size-4 animate-spin" />
      ) : selected ? (
        <Check className="size-4" strokeWidth={2.5} />
      ) : (
        <Plus className="size-4" />
      )}
    </button>
  );
  return withLabel ? <SlipLabel selected={selected}>{button}</SlipLabel> : button;
}

/** Adds a whole list (a page of results, a month of issues) to your selection. */
export function SelectAllButton({ items, label }: { items: TrayItem[]; label: string }) {
  const tray = useTray((s) => s.items);
  const add = useTray((s) => s.add);
  const removeMany = useTray((s) => s.remove);
  const ids = new Set(tray.map((i) => i.identifier));
  const allIn = items.length > 0 && items.every((i) => ids.has(i.identifier));
  if (items.length === 0) return null;
  return (
    <button
      type="button"
      onClick={() => (allIn ? items.forEach((i) => removeMany(i.identifier)) : add(items))}
      className="text-sm text-accent underline-offset-4 hover:underline"
    >
      {allIn ? `Remove ${label}` : `Add ${label}`}
    </button>
  );
}
