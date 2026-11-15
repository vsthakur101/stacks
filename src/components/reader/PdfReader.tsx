'use client';

import { BookA, ChevronLeft, ChevronRight, Maximize2, MoveHorizontal, Minus, Plus, Search, TableOfContents, Volume2 } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/cn';
import { Bookmark, Highlighter, NotesPanel, PageAnnotations, StickyNote, useAnnotations } from './annotations';
import { ContentsPanel, useBookPrefs } from './ContentsPanel';
import { FindPanel, useFind } from './FindPanel';
import { LookupPanel } from './LookupPanel';
import { ReadAloudBar, SpeakingMarks, useReadAloud } from './ReadAloud';
import { ReaderBar, useReadingTimer, useSaveProgress } from './ReaderChrome';
import { FindMarks, TextLayer } from './TextLayer';

type Panel = 'contents' | 'find' | 'lookup' | 'notes';

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
  initialFind,
}: {
  file: string;
  title: string;
  backHref: string;
  initialPage: number;
  /** The next volume of the set, when it's in the Library. */
  next?: { href: string; label: string };
  /** Opens with Find already searching for this (from Search inside books). */
  initialFind?: string;
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
  const [drawing, setDrawing] = useState(false);
  const [panel, setPanel] = useState<Panel | null>(null);
  const togglePanel = useCallback((p: Panel) => setPanel((cur) => (cur === p ? null : p)), []);
  const [scale, setScale] = useState(0);
  const turnTimer = useRef<number | undefined>(undefined);
  const annotations = useAnnotations(file);
  const find = useFind(file, page);
  const prefs = useBookPrefs(file);
  const [lookup, setLookup] = useState<{ word: string; n: number } | null>(null);
  useEffect(() => {
    if (!initialFind) return;
    find.setQuery(initialFind);
    setPanel('find');
    // Only on arrival: later edits belong to the reader.
  }, [initialFind]);
  const lookUp = useCallback((word: string) => {
    setLookup((r) => ({ word, n: (r?.n ?? 0) + 1 }));
    setPanel('lookup');
  }, []);
  const bookmarked = annotations.items.some((a) => a.kind === 'bookmark' && a.page === page);
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
        // wasmUrl: decoders for JPEG 2000 (DLI scans) and JBIG2 images; without them those pages are blank.
        const loading = pdfjs.getDocument({ url: `/api/file?file=${encodeURIComponent(file)}`, rangeChunkSize: 1 << 20, disableAutoFetch: true, wasmUrl: '/pdf-wasm/' });
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
      off.dataset.scale = String(cssScale);
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
      setScale(Number(off.dataset.scale));
      // A new page starts at its top, unless Find is showing a match on it.
      const mark = stage.current?.querySelector('[data-current]');
      if (mark) mark.scrollIntoView({ block: 'center' });
      else stage.current?.scrollTo({ top: 0 });
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
  const ra = useReadAloud({ doc, page, total, go });
  const [reading, setReading] = useState(false);
  // Listening counts as reading even without touching anything.
  useReadingTimer(file, total ? page : undefined, ra.state === 'playing');
  const toggleReading = useCallback(() => {
    if (reading) {
      ra.stop();
      setReading(false);
    } else {
      setReading(true);
      ra.play();
    }
  }, [reading, ra]);
  const zoomBy = useCallback((dir: 1 | -1) => setZoom((z) => ZOOMS[Math.min(Math.max(0, ZOOMS.indexOf(z) + dir), ZOOMS.length - 1)]!), []);

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // ⌘F / Ctrl+F finds in the book (the browser's find only sees the current page).
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setPanel('find');
        document.getElementById('find-q')?.focus();
        return;
      }
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.metaKey || e.ctrlKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key === 'c' || key === 'f') {
        togglePanel(key === 'c' ? 'contents' : 'find');
        e.preventDefault();
        return;
      }
      if (key === 'l') {
        const selected = window.getSelection()?.toString().trim();
        if (selected) lookUp(selected);
        else togglePanel('lookup');
        e.preventDefault();
        return;
      }
      if (e.key === 'h' || e.key === 'H') {
        setDrawing((d) => !d);
        e.preventDefault();
        return;
      }
      if (e.key === 'b' || e.key === 'B') {
        void annotations.toggleBookmark(page);
        e.preventDefault();
        return;
      }
      if (key === 'a') {
        toggleReading();
        e.preventDefault();
        return;
      }
      if (key === 'n') {
        togglePanel('notes');
        e.preventDefault();
        return;
      }
      if (e.key === 'Escape' && (drawing || panel)) {
        setDrawing(false);
        setPanel(null);
        e.preventDefault();
        return;
      }
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
  }, [go, page, total, zoomBy, annotations, drawing, panel, togglePanel, lookUp, toggleReading]);

  /**
   * Click the left or right third of the page to turn. On text, wait a moment: the click may be the
   * first half of a double-click on a word.
   */
  function onStageClick(e: React.MouseEvent) {
    window.clearTimeout(turnTimer.current);
    if (drawing || e.detail > 1 || window.getSelection()?.toString()) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const dir = x < 1 / 3 ? -1 : x > 2 / 3 ? 1 : 0;
    if (!dir) return;
    if ((e.target as HTMLElement).closest('.textLayer')) turnTimer.current = window.setTimeout(() => go(page + dir), 300);
    else go(page + dir);
  }

  /** Double-click a word on the page to look it up. */
  function onStageDoubleClick(e: React.MouseEvent) {
    window.clearTimeout(turnTimer.current);
    if (drawing || !(e.target as HTMLElement).closest('.textLayer')) return;
    const word = window.getSelection()?.toString().trim();
    if (word) lookUp(word);
  }

  // Outline find matches on this page; keep the current one in view.
  const marks = panel === 'find' ? find.matches.flatMap((m, i) => (m.page === page ? m.rects.map((rect) => ({ rect, current: i === find.current })) : [])) : [];
  useEffect(() => {
    if (panel !== 'find') return;
    const id = window.requestAnimationFrame(() => stage.current?.querySelector('[data-current]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    return () => window.cancelAnimationFrame(id);
  }, [find.current, page, scale, panel]);

  const printed = prefs.offset !== null && page - prefs.offset >= 1 ? page - prefs.offset : null;

  const btn = 'inline-flex size-10 items-center justify-center rounded-full text-ink-soft hover:bg-raised hover:text-ink disabled:opacity-40';
  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-raised">
      <ReaderBar title={title} backHref={backHref}>
        <span className="mr-2 hidden tabular-nums text-ink-soft sm:inline" aria-live="polite">
          {!total ? 'Opening…' : printed !== null ? `p. ${printed} · ${page} of ${total}` : `Page ${page} of ${total}`}
        </span>
        <button type="button" className={cn(btn, panel === 'contents' && 'text-ink')} onClick={() => togglePanel('contents')} aria-pressed={panel === 'contents'} aria-label="Contents and go to page (C)" title="Contents and go to page (C)">
          <TableOfContents className="size-4" />
        </button>
        <button type="button" className={cn(btn, panel === 'find' && 'text-ink')} onClick={() => togglePanel('find')} aria-pressed={panel === 'find'} aria-label="Find in this book (F)" title="Find in this book (F or ⌘F)">
          <Search className="size-4" />
        </button>
        <button type="button" className={cn(btn, panel === 'lookup' && 'text-ink')} onClick={() => togglePanel('lookup')} aria-pressed={panel === 'lookup'} aria-label="Look up a word (L)" title="Look up a word (L, or double-click a word)">
          <BookA className="size-4" />
        </button>
        {ra.supported ? (
          <button type="button" className={cn(btn, reading && 'text-ink')} onClick={toggleReading} aria-pressed={reading} aria-label="Read aloud (A)" title="Read aloud (A)">
            <Volume2 className="size-4" />
          </button>
        ) : null}
        <span aria-hidden className="mx-1 h-5 w-px bg-rule" />
        <button
          type="button"
          className={cn(btn, drawing && 'bg-accent text-accent-ink hover:bg-accent hover:text-accent-ink')}
          onClick={() => setDrawing((d) => !d)}
          aria-pressed={drawing}
          aria-label="Highlight: draw a box around a passage (H)"
          title="Highlight: draw a box around a passage (H)"
        >
          <Highlighter className="size-4" />
        </button>
        <button
          type="button"
          className={cn(btn, bookmarked && 'text-accent')}
          onClick={() => void annotations.toggleBookmark(page)}
          aria-pressed={bookmarked}
          aria-label={bookmarked ? 'Remove bookmark (B)' : 'Bookmark this page (B)'}
          title={bookmarked ? 'Remove bookmark (B)' : 'Bookmark this page (B)'}
        >
          <Bookmark className={cn('size-4', bookmarked && 'fill-current')} />
        </button>
        <button
          type="button"
          className={cn(btn, 'relative', panel === 'notes' && 'text-ink')}
          onClick={() => togglePanel('notes')}
          aria-pressed={panel === 'notes'}
          aria-label="Highlights and notes (N)"
          title="Highlights and notes (N)"
        >
          <StickyNote className="size-4" />
          {annotations.items.length > 0 ? (
            <span className="keep-round absolute top-1 right-1 min-w-4 rounded-full bg-accent px-1 text-[0.65rem] leading-4 font-medium text-accent-ink">
              {annotations.items.length}
            </span>
          ) : null}
        </button>
        <span aria-hidden className="mx-1 h-5 w-px bg-rule" />
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

      <div className="relative min-h-0 flex-1">
      <div ref={stage} className="h-full overflow-auto" onClick={onStageClick} onDoubleClick={onStageDoubleClick}>
        {error ? (
          <div className="mx-auto max-w-prose px-6 py-16">
            <p className="font-display text-xl text-ink">This PDF couldn’t be opened.</p>
            <p className="mt-2 text-ink-soft">{error}. Try Open from the Library to read it in Preview.</p>
          </div>
        ) : (
          <div className="flex min-h-full items-start justify-center p-4">
            <div className="relative">
              <canvas
                ref={canvas}
                role="img"
                aria-label={total ? `Page ${page} of ${total}` : 'Loading page'}
                className={cn('t-cover block bg-white shadow-[0_2px_12px_rgb(0_0_0/0.18)]', !doc && 'opacity-0')}
              />
              {doc && scale ? <TextLayer doc={doc} page={page} scale={scale} /> : null}
              {marks.length ? <FindMarks rects={marks} /> : null}
              {reading ? <SpeakingMarks rects={ra.current} /> : null}
              {doc ? <PageAnnotations doc={doc} page={page} drawing={drawing} annotations={annotations} onCreated={() => undefined} onLookup={lookUp} /> : null}
            </div>
          </div>
        )}
      </div>
      {reading ? <ReadAloudBar ra={ra} page={page} onStop={toggleReading} /> : null}
      {drawing ? (
        <p role="status" className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-ink px-3 py-1 text-xs text-paper">
          Drag a box around a passage. Press H or Esc to stop.
        </p>
      ) : null}
      {panel === 'notes' ? <NotesPanel file={file} page={page} annotations={annotations} onGo={(n) => go(n)} onClose={() => setPanel(null)} /> : null}
      {panel === 'contents' ? (
        <ContentsPanel file={file} doc={doc} page={page} total={total} annotations={annotations} prefs={prefs} onGo={(n) => go(n)} onClose={() => setPanel(null)} />
      ) : null}
      {panel === 'find' ? <FindPanel find={find} page={page} onGo={(n) => go(n)} onClose={() => setPanel(null)} /> : null}
      {panel === 'lookup' ? <LookupPanel request={lookup} onClose={() => setPanel(null)} /> : null}
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
