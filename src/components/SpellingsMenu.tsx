import { X } from 'lucide-react';
import Link from 'next/link';
import type { ExpandedQuery } from '@/lib/server/search/variants';
import { Menu } from './Menu';
import { MenuLink } from './FilterBar';

/**
 * "Spellings: +2" in the filter bar. Lists the extra spellings being searched, each removable,
 * plus a switch to exact spelling. Streams in, since the spellings may need a lookup.
 */
export async function SpellingsMenu({
  expanded,
  excluded,
  exact,
  removeHref,
  resetHref,
  exactHref,
}: {
  expanded: Promise<ExpandedQuery>;
  excluded: string[];
  exact: boolean;
  removeHref: (variant: string) => string;
  resetHref: string;
  exactHref: (on: boolean) => string;
}) {
  const { added } = await expanded;
  if (!exact && added.length === 0 && excluded.length === 0) return null;
  const value = exact ? 'Exact' : added.length > 0 ? `+${added.length}` : 'As typed';
  return (
    <Menu label="Spellings" value={value} active={exact || excluded.length > 0}>
      <div className="w-full p-1.5 sm:w-80">
        {!exact && added.length > 0 ? (
          <>
            <p className="px-3 pt-2 pb-1 text-xs text-ink-faint">Also searching for</p>
            <ul>
              {added.map((v) => (
                <li key={v}>
                  <Link
                    href={removeHref(v)}
                    aria-label={`Stop searching for ${v}`}
                    className="group flex min-h-11 items-center justify-between gap-3 rounded-md px-3 text-[0.95rem] text-ink hover:bg-raised"
                  >
                    <span className="font-title">{v}</span>
                    <X aria-hidden className="size-4 text-ink-faint group-hover:text-danger" />
                  </Link>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <div className="mt-1 border-t border-rule pt-1.5">
          {excluded.length > 0 && !exact ? <MenuLink label="Restore removed spellings" href={resetHref} current={false} /> : null}
          <MenuLink label="Every spelling" hint="mahabharat finds महाभारत too" href={exactHref(false)} current={!exact} />
          <MenuLink label="Exact spelling only" href={exactHref(true)} current={exact} />
        </div>
      </div>
    </Menu>
  );
}
