'use client';

import { ChevronLeft, ChevronRight, Maximize2, MoveHorizontal, Minus, Plus } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { ReaderBar, useSaveProgress } from './ReaderChrome';

type Fit = 'width' | 'page';
const ZOOMS = [0.5, 0.67, 0.8, 1, 1.25, 1.5, 2, 3];

/**
 * A themed PDF reader on pdf.js. One page at a time on a canvas; the neighbouring pages are rendered
 * ahead into off-screen canvases so turning is instant. pdf.js fetches the file in 1 MB ranges, so a
 * 140 MB magazine opens without downloading all of it.
 */
export function PdfReader({
  file,
  title,
  backHref,
  initialPage,
  next,
}: {
  file: string;
  title: string;
  backHref: string;
  initialPage: number;
  /** The next volume of the set, when it's in the Library. */
  next?: { href: string; label: string };
}) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(initialPage);
  const [fit, setFit] = useState<Fit>('page');
  const [zoom, setZoom] = useState(1);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const cache = useRef(new Map<string, HTMLCanvasElement>());
  const save = useSaveProgress(file);
  const total = doc?.numPages ?? 0;

  // Load pdf.js and the document.
  useEffect(() => {
    let cancelled = false;
    let task: { destroy: () => Promise<void> } | null = null;
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf-worker';
        const loading = pdfjs.getDocument({ url: `/api/file?file=${encodeURIComponent(file)}`, rangeChunkSize: 1 << 20, disableAutoFetch: true });
        task = loading;
        const loaded = await loading.promise;
        if (cancelled) return;
        setDoc(loaded);
        setPage((p) => Math.min(Math.max(1, p), loaded.numPages));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'This PDF could not be opened.');
      }
    })();
    return () => {
      cancelled = true;
      void task?.destroy();
    };
  }, [file]);

  // Track the space available for the page.
  useEffect(() => {
    const el = stage.current;
    if (!el) return;
    // Measure once now: ResizeObserver only reports on the next rendering frame (and never on hidden pages).
    setBox({ w: Math.floor(el.clientWidth), h: Math.floor(el.clientHeight) });
    const ro = new ResizeObserver(([entry]) => {
      const r = entry!.contentRect;
      setBox({ w: Math.floor(r.width), h: Math.floor(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /** Renders a page at the current fit/zoom into an off-screen canvas (cached). */
  const renderPage = useCallback(
    async (n: number): Promise<HTMLCanvasElement | null> => {
      if (!doc || n < 1 || n > doc.numPages || box.w === 0) return null;
      const key = `${n}:${fit}:${zoom}:${box.w}x${box.h}`;
      const hit = cache.current.get(key);
      if (hit) return hit;
      const pdfPage = await doc.getPage(n);
      const base = pdfPage.getViewport({ scale: 1 });
      const pad = 32;
      const fitScale =
        fit === 'width' ? (box.w - pad) / base.width : Math.min((box.w - pad) / base.width, (box.h - pad) / base.height);
      const cssScale = Math.max(0.1, fitScale * zoom);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const viewport = pdfPage.getViewport({ scale: cssScale * dpr });
      const off = document.createElement('canvas');
      off.width = Math.floor(viewport.width);
      off.height = Math.floor(viewport.height);
      off.style.width = `${Math.floor(viewport.width / dpr)}px`;
      off.style.height = `${Math.floor(viewport.height / dpr)}px`;
      await pdfPage.render({ canvas: off, viewport }).promise;
      // Keep only a handful of rendered pages.
      if (cache.current.size > 8) cache.current.delete(cache.current.keys().next().value!);
      cache.current.set(key, off);
      return off;
    },
    [doc, fit, zoom, box.w, box.h],
  );

  // Show the current page, then prepare its neighbours.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const off = await renderPage(page).catch(() => null);
      const target = canvas.current;
      if (cancelled || !off || !target) return;
      target.width = off.width;
      target.height = off.height;
      target.style.width = off.style.width;
      target.style.height = off.style.height;
      target.getContext('2d')?.drawImage(off, 0, 0);
      stage.current?.scrollTo({ top: 0 });
      void renderPage(page + 1).catch(() => undefined);
      void renderPage(page - 1).catch(() => undefined);
    })();
    return () => {
      cancelled = true;
    };
  }, [page, renderPage]);

  // Remember the position.
  useEffect(() => {
    if (total) save(page, total);
  }, [page, total, save]);

  const go = useCallback((n: number) => setPage((p) => (total ? Math.min(Math.max(1, n), total) : p)), [total]);
  const zoomBy = useCallback((dir: 1 | -1) => setZoom((z) => ZOOMS[Math.min(Math.max(0, ZOOMS.indexOf(z) + dir), ZOOMS.length - 1)]!), []);

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return;
      if (['ArrowRight', 'PageDown', 'j'].includes(e.key) || (e.key === ' ' && !e.shiftKey)) go(page + 1);
      else if (['ArrowLeft', 'PageUp', 'k'].includes(e.key) || (e.key === ' ' && e.shiftKey)) go(page - 1);
      else if (e.key === 'Home') go(1);
      else if (e.key === 'End') go(total);
      else if (e.key === '+' || e.key === '=') zoomBy(1);
      else if (e.key === '-') zoomBy(-1);
      else if (e.key === '0') setZoom(1);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, page, total, zoomBy]);

  /** Click the left or right third of the page to turn. */
  function onStageClick(e: React.MouseEvent) {
    if (window.getSelection()?.toString()) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    if (x < 1 / 3) go(page - 1);
    else if (x > 2 / 3) go(page + 1);
  }

  const btn = 'inline-flex size-10 items-center justify-center rounded-full text-ink-soft hover:bg-raised hover:text-ink disabled:opacity-40';
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-raised">
      <ReaderBar title={title} backHref={backHref}>
        <span className="mr-2 hidden tabular-nums text-ink-soft sm:inline" aria-live="polite">
          {total ? `Page ${page} of ${total}` : 'Opening…'}
        </span>
        <button type="button" className={btn} onClick={() => setFit(fit === 'width' ? 'page' : 'width')} aria-label={fit === 'width' ? 'Fit whole page' : 'Fit page width'} title={fit === 'width' ? 'Fit whole page' : 'Fit page width'}>
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

      <div ref={stage} className="relative min-h-0 flex-1 overflow-auto" onClick={onStageClick}>
        {error ? (
          <div className="mx-auto max-w-prose px-6 py-16">
            <p className="font-display text-xl text-ink">This PDF couldn’t be opened.</p>
            <p className="mt-2 text-ink-soft">{error}. Try Open from the Library to read it in Preview.</p>
          </div>
        ) : (
          <div className="flex min-h-full items-start justify-center p-4">
            <canvas
              ref={canvas}
              role="img"
              aria-label={total ? `Page ${page} of ${total}` : 'Loading page'}
              className={cn('t-cover bg-white shadow-[0_2px_12px_rgb(0_0_0/0.18)]', !doc && 'opacity-0')}
            />
          </div>
        )}
      </div>

      <div className="flex h-14 shrink-0 items-center gap-3 border-t border-rule bg-panel px-3 sm:px-5">
        <button type="button" className={btn} onClick={() => go(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft className="size-5" />
        </button>
        <input
          type="range"
          min={1}
          max={Math.max(1, total)}
          value={page}
          onChange={(e) => go(Number(e.target.value))}
          disabled={!total}
          aria-label="Page"
          className="h-10 min-w-0 flex-1 accent-[var(--accent)]"
        />
        <span className="w-24 text-right text-sm tabular-nums text-ink-soft sm:hidden">{total ? `${page} / ${total}` : ''}</span>
        {next && total && page >= total ? (
          <Link href={next.href} className="keep-round shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink hover:opacity-90">
            Next volume: {next.label}
          </Link>
        ) : null}
        <button type="button" className={btn} onClick={() => go(page + 1)} disabled={!total || page >= total} aria-label="Next page">
          <ChevronRight className="size-5" />
        </button>
      </div>
    </div>
  );
}
