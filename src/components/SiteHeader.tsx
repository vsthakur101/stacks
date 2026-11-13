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

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative shrink-0 py-3 text-[0.95rem] transition-colors',
        'after:absolute after:inset-x-0 after:bottom-0 after:h-[3px] after:bg-accent after:transition-transform',
        active ? 'text-ink after:scale-x-100' : 'text-ink-soft after:scale-x-0 hover:text-ink',
      )}
    >
      {label}
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const active = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  if (pathname.startsWith('/read/')) return null;

  return (
    <header className="t-header">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-12 px-4 sm:px-8 lg:px-12">
        <Link href="/" className="t-wordmark py-3 text-[1.9rem] text-ink">
          Stacks
        </Link>
        <nav aria-label="Sections" className="order-3 flex w-full gap-7 overflow-x-auto [scrollbar-width:none] sm:order-none sm:w-auto [&::-webkit-scrollbar]:hidden">
          {SECTIONS.map((s) => (
            <NavLink key={s.href} href={s.href} label={s.label} active={active(s.href)} />
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-6">
          <NavLink href="/search" label="Search" active={active('/search')} />
          <NavLink href="/library" label="Library" active={active('/library')} />
          <NavLink href="/downloads" label="Downloads" active={active('/downloads')} />
          <Link
            href="/settings"
            aria-label="Settings"
            aria-current={active('/settings') ? 'page' : undefined}
            className={cn('-m-2 p-3', active('/settings') ? 'text-accent' : 'text-ink-soft hover:text-ink')}
          >
            <Settings className="size-[1.1rem]" />
          </Link>
        </div>
      </div>
    </header>
  );
}
