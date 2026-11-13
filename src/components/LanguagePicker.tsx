import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/cn';
import { findLanguage, LANGUAGES, OTHER_LANGUAGE, OTHER_LANGUAGE_LABEL, type Language } from '@/lib/shared/languages';

const pill = 'inline-flex items-baseline gap-1.5 rounded-full px-3.5 py-1.5 transition-colors';
const on = 'bg-raised text-ink shadow-[0_1px_2px_rgb(0_0_0/0.12)] ring-1 ring-rule';
const off = 'text-ink-soft hover:text-ink';

function Label({ lang }: { lang: Language }) {
  return (
    <>
      <span lang={lang.code === 'eng' ? 'en' : undefined} className="font-serif text-[1.02rem]">
        {lang.endonym}
      </span>
      {lang.endonym !== lang.name ? <span className="text-xs text-ink-faint">{lang.name}</span> : null}
    </>
  );
}

/**
 * Filters a search by language. A few languages are pills; the rest sit behind "More languages"
 * (a <details> disclosure, so it works without JS). Every choice is a link: the language lives in the URL.
 */
export function LanguagePicker({ current, href }: { current?: string; href: (code?: string) => string }) {
  const selected = findLanguage(current);
  const other = current === OTHER_LANGUAGE;
  const pills = LANGUAGES.filter((l) => l.primary || l.code === selected?.code);
  const rest = LANGUAGES.filter((l) => !l.primary);

  return (
    <div role="group" aria-label="Language" className="flex flex-wrap items-center gap-1 text-sm">
      <span className="mr-2 text-ink-faint">Language</span>
      <Link href={href(undefined)} aria-current={!selected && !other ? 'true' : undefined} className={cn(pill, !selected && !other ? on : off)}>
        Any
      </Link>
      {pills.map((l) => (
        <Link
          key={l.code}
          href={href(l.code)}
          aria-current={selected?.code === l.code ? 'true' : undefined}
          aria-label={l.name}
          className={cn(pill, selected?.code === l.code ? on : off)}
        >
          <Label lang={l} />
        </Link>
      ))}
      <details className="group relative">
        <summary className={cn(pill, off, 'cursor-pointer list-none [&::-webkit-details-marker]:hidden')}>
          More languages
          <ChevronDown className="size-3.5 self-center transition-transform group-open:rotate-180" />
        </summary>
        <ul className="rule-double absolute left-0 z-20 mt-2 grid w-[min(22rem,80vw)] grid-cols-2 gap-1 border-[3px] bg-raised p-2 shadow-[0_12px_32px_-16px_rgb(0_0_0/0.5)]">
          {rest.map((l) => (
            <li key={l.code}>
              <Link
                href={href(l.code)}
                aria-current={selected?.code === l.code ? 'true' : undefined}
                aria-label={l.name}
                className={cn(pill, 'w-full', selected?.code === l.code ? on : off)}
              >
                <Label lang={l} />
              </Link>
            </li>
          ))}
        </ul>
      </details>
      {/* Untagged texts and languages outside the list, so a language choice never hides anything for good. */}
      <Link
        href={href(OTHER_LANGUAGE)}
        aria-current={other ? 'true' : undefined}
        className={cn(pill, other ? on : off)}
      >
        {OTHER_LANGUAGE_LABEL}
      </Link>
    </div>
  );
}
