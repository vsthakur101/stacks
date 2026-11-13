'use client';

import { Settings } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/cn';

const SECTIONS = [
  { href: '/books', label: 'Books' },
  { href: '/newspapers', label: 'Newspapers' },
  { href: '/magazines', label: 'Magazines' },
  { href: '/government', label: 'Government' },
  { href: '/manuscripts', label: 'Manuscripts' },
];

export function SiteHeader() {
  const pathname = usePathname();
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  if (pathname.startsWith('/read/')) return null;

  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-10 gap-y-2 px-4 py-4 sm:px-8">
        <Link href="/" className="font-serif text-2xl italic tracking-tight text-ink">
          Stacks
        </Link>
        <nav aria-label="Sections" className="-mx-1 order-3 flex w-full gap-1 overflow-x-auto sm:order-none sm:w-auto">
          {SECTIONS.map((s) => (
            <Link
              key={s.href}
              href={s.href}
              aria-current={active(s.href) ? 'page' : undefined}
              className={cn(
                'shrink-0 rounded-full px-3 py-1.5 text-sm transition-colors',
                active(s.href) ? 'bg-ink text-paper' : 'text-ink-soft hover:text-ink',
              )}
            >
              {s.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1 text-sm">
          <Link
            href="/search"
            aria-current={active('/search') ? 'page' : undefined}
            className={cn('rounded-full px-3 py-1.5', active('/search') ? 'text-ink' : 'text-ink-soft hover:text-ink')}
          >
            Search
          </Link>
          <Link
            href="/downloads"
            aria-current={active('/downloads') ? 'page' : undefined}
            className={cn('rounded-full px-3 py-1.5', active('/downloads') ? 'text-ink' : 'text-ink-soft hover:text-ink')}
          >
            Downloads
          </Link>
          <Link
            href="/settings"
            aria-label="Settings"
            className={cn('rounded-full p-2', active('/settings') ? 'text-ink' : 'text-ink-soft hover:text-ink')}
          >
            <Settings className="size-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
