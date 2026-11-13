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
        'relative shrink-0 py-2 text-[0.95rem] transition-colors',
        'after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-accent after:transition-transform',
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
    <header className="rule-double border-b-[3px]">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-12 gap-y-1 px-4 pt-4 sm:px-8 lg:px-12">
        <Link href="/" className="pb-3 font-serif text-[1.75rem] italic leading-none text-ink">
          Stacks
        </Link>
        <nav aria-label="Sections" className="order-3 -mb-px flex w-full gap-7 overflow-x-auto [scrollbar-width:none] sm:order-none sm:w-auto [&::-webkit-scrollbar]:hidden">
          {SECTIONS.map((s) => (
            <NavLink key={s.href} href={s.href} label={s.label} active={active(s.href)} />
          ))}
        </nav>
        <div className="-mb-px ml-auto flex items-center gap-6">
          <NavLink href="/search" label="Search" active={active('/search')} />
          <NavLink href="/downloads" label="Downloads" active={active('/downloads')} />
          <Link
            href="/settings"
            aria-label="Settings"
            aria-current={active('/settings') ? 'page' : undefined}
            className={cn('py-2', active('/settings') ? 'text-accent' : 'text-ink-soft hover:text-ink')}
          >
            <Settings className="size-[1.05rem]" />
          </Link>
        </div>
      </div>
    </header>
  );
}
