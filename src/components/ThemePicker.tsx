'use client';

import { Check } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/cn';
import { THEME_COOKIE, THEMES, type ThemeId } from '@/lib/shared/themes';

/**
 * Three looks, each previewed in its own colours and type (the preview carries its own data-theme).
 * Choosing one applies it immediately and remembers it in a cookie, so pages render in it from the server.
 */
export function ThemePicker({ initial }: { initial: ThemeId }) {
  const [theme, setTheme] = useState<ThemeId>(initial);

  function choose(id: ThemeId) {
    setTheme(id);
    document.documentElement.dataset.theme = id;
    document.cookie = `${THEME_COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`;
  }

  return (
    <div role="radiogroup" aria-label="Look" className="grid gap-4 sm:grid-cols-3">
      {THEMES.map((t) => {
        const on = theme === t.id;
        return (
          <button
            key={t.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => choose(t.id)}
            className={cn(
              'keep-round group overflow-hidden rounded-xl border-2 text-left transition-colors',
              on ? 'border-accent' : 'border-rule hover:border-ink-faint',
            )}
          >
            <Preview id={t.id} />
            <span className="flex items-start justify-between gap-3 bg-paper p-4">
              <span>
                <span className="block font-medium text-ink">{t.name}</span>
                <span className="mt-1 block text-sm text-ink-soft">{t.blurb}</span>
              </span>
              <span
                className={cn(
                  'keep-round mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                  on ? 'border-accent bg-accent text-accent-ink' : 'border-rule',
                )}
              >
                {on ? <Check className="size-3.5" strokeWidth={3} /> : null}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** A miniature page drawn with the theme's own tokens. */
function Preview({ id }: { id: ThemeId }) {
  return (
    <span data-theme={id} data-section="books" aria-hidden className="block bg-paper text-ink">
      <span className="t-header flex items-center gap-3 px-3 py-2">
        <span className="t-wordmark text-lg text-ink">Stacks</span>
        <span className="text-[0.75rem] text-ink-soft">Books</span>
        <span className="text-[0.75rem] text-ink-soft">Magazines</span>
      </span>
      <span className="block px-3 pt-3 pb-4">
        <span className="font-display block text-2xl text-ink">महाभारत</span>
        <span className="mt-3 grid grid-cols-4 gap-2">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className={cn('t-cover block aspect-[2/3]', i === 1 ? 't-fallback' : 'bg-raised')} />
          ))}
        </span>
        <span className="mt-3 flex items-center justify-between">
          <span className="text-[0.75rem] text-ink-faint">4,202 scans</span>
          <span className="rounded-full bg-accent px-2.5 py-1 text-[0.75rem] font-medium text-accent-ink">Download</span>
        </span>
      </span>
    </span>
  );
}
