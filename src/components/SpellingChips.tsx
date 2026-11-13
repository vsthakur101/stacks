import { X } from 'lucide-react';
import Link from 'next/link';

/**
 * Shows the extra spellings a search also matched, each removable, plus a switch to exact spelling.
 * Server component: every control is a link.
 */
export function SpellingChips({
  added,
  excluded,
  exact,
  removeHref,
  resetHref,
  exactHref,
}: {
  added: string[];
  excluded: string[];
  exact: boolean;
  removeHref: (variant: string) => string;
  resetHref: string;
  exactHref: (on: boolean) => string;
}) {
  if (exact) {
    return (
      <p className="mt-3 text-sm text-ink-soft">
        Exact spelling only.{' '}
        <Link href={exactHref(false)} className="text-accent underline-offset-4 hover:underline">
          Search every spelling
        </Link>
      </p>
    );
  }
  if (added.length === 0 && excluded.length === 0) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-sm">
      {added.length > 0 ? <span className="mr-1 text-ink-faint">Also searching for</span> : null}
      {added.map((v) => (
        <Link
          key={v}
          href={removeHref(v)}
          aria-label={`Stop searching for ${v}`}
          className="group inline-flex items-center gap-1 rounded-full border border-rule py-0.5 pr-1.5 pl-3 text-ink hover:border-accent"
        >
          <span className="font-serif text-[1.02rem]">{v}</span>
          <X className="size-3.5 text-ink-faint group-hover:text-accent" />
        </Link>
      ))}
      <span className="ml-2 flex gap-3">
        {excluded.length > 0 ? (
          <Link href={resetHref} className="text-ink-soft underline-offset-4 hover:text-ink hover:underline">
            Restore spellings
          </Link>
        ) : null}
        <Link href={exactHref(true)} className="text-ink-soft underline-offset-4 hover:text-ink hover:underline">
          Exact spelling only
        </Link>
      </span>
    </div>
  );
}
