'use client';

import { ChevronLeft, ChevronRight, Minus, Plus, Rows3, TableOfContents } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { ReaderBar, useReadingTimer } from './ReaderChrome';
import { SidePanel } from './SidePanel';

type Book = import('epubjs').Book;
type Rendition = import('epubjs').Rendition;
interface TocItem {
  label: string;
  href: string;
  depth: number;
}

const SIZES = [80, 90, 100, 110, 125, 140, 160];

/** Saves the exact place (CFI) and a percentage; debounced like the other readers. */
function useSaveEpubProgress(file: string) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  return useCallback(
    (cfi: string, fraction: number) => {
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        void fetch('/api/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file, page: Math.max(1, Math.round(fraction * 999) + 1), total: 1000, position: cfi }),
          keepalive: true,
        }).catch(() => undefined);
      }, 800);
    },
    [file],
  );
}

interface SpineSection {
  href?: string;
  idref?: string;
  index: number;
  properties?: string[];
}

/**
 * Some EPUBs (archive.org's generated ones among them) list a reading-order entry with no file behind
 * it ("cover"); epub.js crashes on it. Drop such entries and renumber the rest.
 */
function dropMissingSections(book: Book) {
  const spine = book.spine as unknown as { spineItems: SpineSection[]; spineByHref: Record<string, number>; spineById: Record<string, number>; length: number };
  const ok = spine.spineItems.filter((s) => s.href);
  if (ok.length === spine.spineItems.length) return;
  spine.spineByHref = {};
  spine.spineById = {};
  ok.forEach((s, i) => {
    s.index = i;
    spine.spineByHref[s.href!] = i;
    if (s.idref) spine.spineById[s.idref] = i;
  });
  spine.spineItems = ok;
  spine.length = ok.length;
}

/** Where a book starts the first time: skip a navigation page in the reading order (often blank). */
function firstReadable(book: Book): string | undefined {
  const items = (book.spine as unknown as { spineItems: SpineSection[] }).spineItems;
  return items.find((s) => s.href && !s.properties?.includes('nav'))?.href;
}

/** The theme's colours and reading font, so the book matches Catalogue, Reading or Poster, light or dark. */
function themeStyles() {
  const css = getComputedStyle(document.documentElement);
  const v = (name: string) => css.getPropertyValue(name).trim();
  return {
    body: { color: `${v('--ink')} !important`, background: `${v('--paper')} !important`, 'line-height': '1.6' },
    'p, li, blockquote, td': { color: `${v('--ink')} !important` },
    a: { color: `${v('--accent')} !important` },
  };
}

/**
 * EPUB reader on epub.js: the book's own HTML in a sandboxed frame (no scripts), paginated or
 * scrolled, in the app's colours; contents, text size, keyboard and click-to-turn; remembers the exact
 * place (CFI).
 */
export function EpubReader({ file, title, backHref, initialPosition }: { file: string; title: string; backHref: string; initialPosition?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const rendition = useRef<Rendition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [toc, setToc] = useState<TocItem[]>([]);
  const tocRef = useRef<TocItem[]>([]);
  /** Where the reader is now: kept across rebuilds (switching pages/scrolling). */
  const here = useRef<string | undefined>(initialPosition || undefined);
  const [panel, setPanel] = useState(false);
  const [size, setSize] = useState(100);
  const [scrolled, setScrolled] = useState(false);
  const [fraction, setFraction] = useState<number | null>(null);
  const [chapter, setChapter] = useState('');
  const [turns, setTurns] = useState(0);
  const save = useSaveEpubProgress(file);
  useReadingTimer(file, turns || undefined);

  const next = useCallback(() => void rendition.current?.next(), []);
  const prev = useCallback(() => void rendition.current?.prev(), []);

  useEffect(() => {
    let book: Book | null = null;
    let cancelled = false;
    (async () => {
      try {
        const ePub = (await import('epubjs')).default;
        // Opened from the bytes: epub.js mis-resolves chapter paths when given a URL without ".epub".
        const res = await fetch(`/api/file?${new URLSearchParams({ file })}`);
        if (!res.ok) throw new Error(`The file couldn’t be read (${res.status})`);
        const data = await res.arrayBuffer();
        if (cancelled) return;
        book = ePub(data);
        await book.opened;
        if (cancelled) return;
        dropMissingSections(book);
        const r = book.renderTo(host.current!, { width: '100%', height: '100%', flow: scrolled ? 'scrolled-doc' : 'paginated', spread: 'auto', allowScriptedContent: false });
        rendition.current = r;
        r.themes.default(themeStyles());
        r.themes.fontSize(`${size}%`);
        const onKey = (e: KeyboardEvent) => {
          if (e.key === 'ArrowRight' || e.key === 'PageDown') void r.next();
          if (e.key === 'ArrowLeft' || e.key === 'PageUp') void r.prev();
        };
        r.on('keyup', onKey);
        r.on('relocated', (loc: { start: { cfi: string; percentage: number; href: string } }) => {
          setTurns((t) => t + 1);
          here.current = loc.start.cfi;
          const pct = book!.locations.length() ? book!.locations.percentageFromCfi(loc.start.cfi) : loc.start.percentage;
          setFraction(pct);
          save(loc.start.cfi, pct ?? 0);
          const item = tocRef.current.find((t) => loc.start.href.endsWith(t.href.split('#')[0]!));
          if (item) setChapter(item.label);
        });
        await r.display(here.current ?? firstReadable(book));
        if (cancelled) return;
        setReady(true);
        const nav = await book.loaded.navigation;
        const flat: TocItem[] = [];
        const walk = (items: { label: string; href: string; subitems?: unknown[] }[], depth: number) => {
          for (const i of items) {
            flat.push({ label: i.label.trim(), href: i.href, depth });
            if (i.subitems?.length) walk(i.subitems as typeof items, depth + 1);
          }
        };
        walk(nav.toc as never, 0);
        tocRef.current = flat;
        if (!cancelled) setToc(flat);
        // Percentages need the book's locations: computed after the first page shows.
        await book.locations.generate(1600);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'This EPUB could not be opened.');
      }
    })();
    const onWindowKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') void rendition.current?.next();
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') void rendition.current?.prev();
      else if (e.key === 'c' || e.key === 'C') setPanel((p) => !p);
      else if (e.key === 'Escape') setPanel(false);
    };
    window.addEventListener('keydown', onWindowKey);
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onWindowKey);
      book?.destroy();
      rendition.current = null;
    };
    // Flow changes rebuild the view at the saved place; size changes apply live below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, scrolled]);

  useEffect(() => {
    rendition.current?.themes.fontSize(`${size}%`);
  }, [size]);

  // Follow the app's light/dark switch.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => rendition.current?.themes.default(themeStyles());
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const btn = 'inline-flex size-10 items-center justify-center rounded-full text-ink-soft hover:bg-raised hover:text-ink disabled:opacity-40';
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-paper">
      <ReaderBar title={title} backHref={backHref}>
        <span className="mr-2 hidden tabular-nums text-ink-soft sm:inline" aria-live="polite">
          {!ready ? 'Opening…' : fraction !== null ? `${Math.round(fraction * 100)}%` : ''}
        </span>
        <button type="button" className={cn(btn, panel && 'text-ink')} onClick={() => setPanel((p) => !p)} aria-pressed={panel} aria-label="Contents (C)" title="Contents (C)" disabled={!toc.length}>
          <TableOfContents className="size-4" />
        </button>
        <button type="button" className={cn(btn, scrolled && 'text-ink')} onClick={() => setScrolled((s) => !s)} aria-pressed={scrolled} aria-label={scrolled ? 'Show as pages' : 'Scroll instead of pages'} title={scrolled ? 'Show as pages' : 'Scroll instead of pages'}>
          <Rows3 className="size-4" />
        </button>
        <span aria-hidden className="mx-1 h-5 w-px bg-rule" />
        <button type="button" className={btn} onClick={() => setSize((s) => SIZES[Math.max(0, SIZES.indexOf(s) - 1)]!)} disabled={size === SIZES[0]} aria-label="Smaller text">
          <Minus className="size-4" />
        </button>
        <span className="hidden w-12 text-center tabular-nums text-ink-soft sm:inline">{size}%</span>
        <button type="button" className={btn} onClick={() => setSize((s) => SIZES[Math.min(SIZES.length - 1, SIZES.indexOf(s) + 1)]!)} disabled={size === SIZES.at(-1)} aria-label="Larger text">
          <Plus className="size-4" />
        </button>
      </ReaderBar>
      <div className="relative min-h-0 flex-1">
        {error ? (
          <div className="mx-auto max-w-prose px-6 py-16">
            <p className="font-display text-xl text-ink">This EPUB couldn’t be opened.</p>
            <p className="mt-2 text-ink-soft">{error}. Try Open from the Library to read it in Books.</p>
          </div>
        ) : (
          <div className="mx-auto flex h-full max-w-5xl items-stretch">
            {!scrolled ? (
              <button type="button" onClick={prev} aria-label="Previous page" className="hidden w-12 shrink-0 items-center justify-center text-ink-faint hover:text-ink sm:flex">
                <ChevronLeft className="size-6" />
              </button>
            ) : null}
            <div ref={host} className="min-w-0 flex-1 py-4" aria-label={title} />
            {!scrolled ? (
              <button type="button" onClick={next} aria-label="Next page" className="hidden w-12 shrink-0 items-center justify-center text-ink-faint hover:text-ink sm:flex">
                <ChevronRight className="size-6" />
              </button>
            ) : null}
          </div>
        )}
        {panel ? (
          <SidePanel title="Contents" onClose={() => setPanel(false)}>
            <ol className="min-h-0 flex-1 overflow-y-auto py-2">
              {toc.map((t, i) => (
                <li key={i}>
                  <button
                    type="button"
                    onClick={() => {
                      void rendition.current?.display(t.href);
                      setPanel(false);
                    }}
                    className={cn('block w-full py-2 pr-4 text-left text-sm hover:bg-raised', chapter === t.label ? 'text-accent' : 'text-ink')}
                    style={{ paddingLeft: `${1 + t.depth}rem` }}
                  >
                    {t.label}
                  </button>
                </li>
              ))}
            </ol>
          </SidePanel>
        ) : null}
      </div>
      <div className="flex h-12 shrink-0 items-center gap-3 border-t border-rule bg-panel px-3 text-sm text-ink-soft sm:hidden">
        <button type="button" className={btn} onClick={prev} aria-label="Previous page">
          <ChevronLeft className="size-5" />
        </button>
        <span className="min-w-0 flex-1 truncate text-center">{chapter}</span>
        <button type="button" className={btn} onClick={next} aria-label="Next page">
          <ChevronRight className="size-5" />
        </button>
      </div>
    </div>
  );
}
