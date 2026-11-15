'use client';

import { ChevronLeft, ChevronRight, ExternalLink, Maximize2, Minus, MoveHorizontal, Plus } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { ReaderBar } from './ReaderChrome';

interface Page {
  n: number;
  label?: string;
  width: number;
  height: number;
}

const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2];
const WIDTHS = [800, 1200, 1600, 2000];
const KEY = (id: string) => `stacks-online-${id}`;

/**
 * Reads a scan you haven't downloaded, page by page, in Stacks' own reader. Pages come from
 * archive.org (≈3 s each the first time) through a local cache that also fetches ahead.
 */
export function OnlineReader({ identifier, title, pages, backHref }: { identifier: string; title: string; pages: Page[]; backHref: string }) {
  const total = pages.length;
  const [page, setPage] = useState(1);
  const [fit, setFit] = useState<'page' | 'width'>('page');
  const [zoom, setZoom] = useState(1);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [slow, setSlow] = useState(false);
  const stage = useRef<HTMLDivElement>(null);

  // Where you were last time (kept in this browser).
  useEffect(() => {
    try {
      const saved = Number(localStorage.getItem(KEY(identifier)));
      if (saved >= 1 && saved <= total) setPage(saved);
    } catch {
      /* private window */
    }
  }, [identifier, total]);
  useEffect(() => {
    try {
      localStorage.setItem(KEY(identifier), String(page));
    } catch {
      /* private window */
    }
  }, [identifier, page]);

  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    setBox({ w: el.clientWidth, h: el.clientHeight });
    const ro = new ResizeObserver(([e]) => setBox({ w: Math.floor(e!.contentRect.width), h: Math.floor(e!.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const current = pages[page - 1];
  const pad = 32;
  const scale = current ? (fit === 'width' ? (box.w - pad) / current.width : Math.min((box.w - pad) / current.width, (box.h - pad) / current.height)) * zoom : 0;
  const cssW = current ? Math.max(1, Math.floor(current.width * scale)) : 0;
  const cssH = current ? Math.max(1, Math.floor(current.height * scale)) : 0;
  const dpr = typeof window === 'undefined' ? 1 : Math.min(window.devicePixelRatio || 1, 2);
  const want = WIDTHS.find((w) => w >= cssW * dpr) ?? WIDTHS.at(-1)!;
  const src = (n: number) => `/page-image/${encodeURIComponent(identifier)}/${n}?w=${want}`;

  // Read ahead in the browser too, so the next pages are decoded before you turn.
  useEffect(() => {
    if (!box.w) return;
    for (const n of [page + 1, page + 2]) if (n <= total) new Image().src = src(n);
    setFailed(false);
    setSlow(false);
    const t = setTimeout(() => setSlow(true), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, want, box.w]);

  const go = useCallback((n: number) => setPage(Math.min(Math.max(1, n), total)), [total]);
  const zoomBy = useCallback((dir: 1 | -1) => setZoom((z) => ZOOMS[Math.min(Math.max(0, ZOOMS.indexOf(z) + dir), ZOOMS.length - 1)]!), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (['ArrowRight', 'PageDown', 'j'].includes(e.key) || (e.key === ' ' && !e.shiftKey)) go(page + 1);
      else if (['ArrowLeft', 'PageUp', 'k'].includes(e.key) || (e.key === ' ' && e.shiftKey)) go(page - 1);
      else if (e.key === 'Home') go(1);
      else if (e.key === 'End') go(total);
      else if (e.key === '+' || e.key === '=') zoomBy(1);
      else if (e.key === '-') zoomBy(-1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, page, total, zoomBy]);

  const btn = 'inline-flex size-10 items-center justify-center rounded-full text-ink-soft hover:bg-raised hover:text-ink disabled:opacity-40';
  const showing = loaded === src(page);
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-raised">
      <ReaderBar title={title} backHref={backHref} backLabel="Details">
        <span className="mr-2 hidden tabular-nums text-ink-soft sm:inline" aria-live="polite">
          Page {page} of {total}
          {current?.label && current.label !== String(page) && /^(?!0+$)([0-9]+|[ivxlcdm]+)$/i.test(current.label) ? ` (p. ${current.label})` : ''}
        </span>
        <a href={`https://archive.org/details/${encodeURIComponent(identifier)}/page/n${page - 1}`} target="_blank" rel="noreferrer" className={btn} aria-label="Open this page in archive.org’s viewer" title="Open this page in archive.org’s viewer">
          <ExternalLink className="size-4" />
        </a>
        <span aria-hidden className="mx-1 h-5 w-px bg-rule" />
        <button type="button" className={btn} onClick={() => setFit(fit === 'width' ? 'page' : 'width')} aria-label={fit === 'width' ? 'Fit whole page' : 'Fit page width'}>
          {fit === 'width' ? <Maximize2 className="size-4" /> : <MoveHorizontal className="size-4" />}
        </button>
        <button type="button" className={btn} onClick={() => zoomBy(-1)} disabled={zoom === ZOOMS[0]} aria-label="Zoom out">
          <Minus className="size-4" />
        </button>
        <span className="hidden w-12 text-center tabular-nums text-ink-soft sm:inline">{Math.round(zoom * 100)}%</span>
        <button type="button" className={btn} onClick={() => zoomBy(1)} disabled={zoom === ZOOMS.at(-1)} aria-label="Zoom in">
          <Plus className="size-4" />
        </button>
      </ReaderBar>

      <div
        ref={stage}
        className="min-h-0 flex-1 overflow-auto"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width;
          if (x < 1 / 3) go(page - 1);
          else if (x > 2 / 3) go(page + 1);
        }}
      >
        <div className="flex min-h-full items-start justify-center p-4">
          {current && box.w ? (
            <div className="t-cover relative bg-white shadow-[0_2px_12px_rgb(0_0_0/0.18)]" style={{ width: cssW, height: cssH }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- local page cache */}
              <img
                key={src(page)}
                src={src(page)}
                alt={`Page ${page} of ${total}`}
                width={cssW}
                height={cssH}
                onLoad={() => setLoaded(src(page))}
                onError={() => setFailed(true)}
                className={cn('block h-full w-full transition-opacity duration-150', showing ? 'opacity-100' : 'opacity-0')}
              />
              {!showing ? (
                <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-ink-soft" role="status">
                  {failed ? (
                    <span>
                      archive.org didn’t send this page.{' '}
                      <button type="button" onClick={(e) => (e.stopPropagation(), setFailed(false), setLoaded(null), setPage((p) => p))} className="text-accent underline underline-offset-4">
                        Try again
                      </button>
                    </span>
                  ) : slow ? (
                    'Fetching this page from archive.org (a few seconds the first time; pages you’ve seen open at once).'
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex h-14 shrink-0 items-center gap-3 border-t border-rule bg-panel px-3 sm:px-5">
        <button type="button" className={btn} onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft className="size-5" />
        </button>
        <input type="range" min={1} max={Math.max(1, total)} value={page} onChange={(e) => go(Number(e.target.value))} aria-label="Page" className="h-10 min-w-0 flex-1 accent-[var(--accent)]" />
        <button type="button" className={btn} onClick={() => go(page + 1)} disabled={page >= total} aria-label="Next page">
          <ChevronRight className="size-5" />
        </button>
      </div>
    </div>
  );
}
