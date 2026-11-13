'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';

/**
 * A filter-bar menu built on <details>, so it works before JavaScript loads. With JS it also closes
 * on outside click, Escape, and after picking an option. Desktop: dropdown; phone: bottom sheet (CSS).
 */
export function Menu({
  label,
  value,
  active,
  children,
}: {
  label: string;
  value: React.ReactNode;
  /** True when this filter differs from its default; the trigger is highlighted. */
  active?: boolean;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const close = () => el.removeAttribute('open');
    const onDown = (e: PointerEvent) => {
      if (el.open && !el.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && el.open) {
        close();
        el.querySelector('summary')?.focus();
      }
    };
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest('a')) close();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    el.addEventListener('click', onClick);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
      el.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <details ref={ref} className="group relative shrink-0">
      <summary
        className={cn(
          'flex min-h-10 list-none items-center gap-1.5 rounded-full border px-3.5 text-sm whitespace-nowrap transition-colors [&::-webkit-details-marker]:hidden',
          active ? 'border-accent bg-accent-wash text-ink' : 'border-rule text-ink-soft hover:border-ink-faint hover:text-ink',
        )}
      >
        <span className="text-ink-faint">{label}</span>
        <span className="font-medium text-ink">{value}</span>
        <ChevronDown aria-hidden className="size-4 text-ink-faint transition-transform group-open:rotate-180" />
      </summary>
      <div className="menu-panel" role="menu" aria-label={label}>
        <p className="border-b border-rule px-4 py-3 text-sm font-medium text-ink sm:hidden">{label}</p>
        {children}
      </div>
    </details>
  );
}
