'use client';

import { Check, Plus } from 'lucide-react';
import { useTray } from '@/lib/client/tray';
import { cn } from '@/lib/cn';
import type { TrayItem } from '@/lib/shared/types';

/** Adds or removes every volume of a set at once. */
export function SetSelectToggle({ items, title, className }: { items: TrayItem[]; title: string; className?: string }) {
  const tray = useTray((s) => s.items);
  const add = useTray((s) => s.add);
  const remove = useTray((s) => s.remove);
  const ids = new Set(tray.map((i) => i.identifier));
  const all = items.length > 0 && items.every((i) => ids.has(i.identifier));
  return (
    <button
      type="button"
      aria-pressed={all}
      aria-label={all ? `Remove all ${items.length} volumes of “${title}” from your selection` : `Add all ${items.length} volumes of “${title}” to your selection`}
      onClick={() => (all ? items.forEach((i) => remove(i.identifier)) : add(items))}
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-full border transition-colors pointer-coarse:size-11',
        all ? 'border-accent bg-accent text-accent-ink' : 'border-ink/25 bg-raised/95 text-ink-soft hover:border-accent hover:text-accent',
        className,
      )}
    >
      {all ? <Check className="size-4" strokeWidth={2.5} /> : <Plus className="size-4" />}
    </button>
  );
}
