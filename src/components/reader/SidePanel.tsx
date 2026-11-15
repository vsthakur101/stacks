'use client';

import { X } from 'lucide-react';
import type { ReactNode } from 'react';

/** The reader's right-hand panel (Contents, Find, Look up, Notes). One open at a time. */
export function SidePanel({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  return (
    <aside aria-label={title} className="absolute inset-y-0 right-0 z-20 flex w-full max-w-sm flex-col border-l border-rule bg-panel shadow-2xl">
      <div className="flex items-center justify-between border-b border-rule px-4 py-3">
        <h2 className="font-display text-lg text-ink">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" title="Close (Esc)" className="-mr-2 rounded-full p-2.5 text-ink-soft hover:text-ink">
          <X className="size-4" />
        </button>
      </div>
      {children}
      {footer ? <div className="border-t border-rule px-4 py-3 text-sm">{footer}</div> : null}
    </aside>
  );
}

export const fieldClass =
  'w-full rounded-md border border-rule bg-paper px-3 py-2 text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none';
