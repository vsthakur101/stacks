import { Check } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { Menu } from './Menu';

export interface FilterOption {
  key: string;
  label: React.ReactNode;
  /** Optional second line, e.g. the English name under an endonym. */
  hint?: string;
  href: string;
  current: boolean;
}

export interface FilterMenuSpec {
  label: string;
  value: React.ReactNode;
  active?: boolean;
  options: FilterOption[];
  /** Lay options out in two columns (long lists like languages). */
  columns?: 2;
}

/**
 * Every search control on one line. On phones the line scrolls sideways rather than wrapping, so
 * results start right under the search box. `children` can add more menus (e.g. spellings, streamed).
 */
export function FilterBar({ menus, children }: { menus: FilterMenuSpec[]; children?: React.ReactNode }) {
  return (
    <div
      role="toolbar"
      aria-label="Filters"
      className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {menus.map((m) => (
        <Menu key={m.label} label={m.label} value={m.value} active={m.active}>
          <ul className={cn('p-1.5', m.columns === 2 && 'sm:grid sm:w-[26rem] sm:grid-cols-2')}>
            {m.options.map((o) => (
              <li key={o.key}>
                <MenuLink {...o} />
              </li>
            ))}
          </ul>
        </Menu>
      ))}
      {children}
    </div>
  );
}

export function MenuLink({ label, hint, href, current }: Omit<FilterOption, 'key'>) {
  return (
    <Link
      href={href}
      role="menuitemradio"
      aria-checked={current}
      className={cn(
        'flex min-h-11 items-center gap-3 rounded-md px-3 py-1.5 text-[0.95rem]',
        current ? 'bg-accent-wash text-ink' : 'text-ink hover:bg-raised',
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        {current ? <Check className="size-4 text-accent" strokeWidth={2.5} /> : null}
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate">{label}</span>
        {hint ? <span className="truncate text-xs text-ink-faint">{hint}</span> : null}
      </span>
    </Link>
  );
}
