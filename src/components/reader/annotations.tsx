'use client';

import { Bookmark, Download, Highlighter, StickyNote, Trash2 } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client/api';
import { cn } from '@/lib/cn';
import { SidePanel } from './SidePanel';
import { COLOR_FILL, COLOR_SOLID, HIGHLIGHT_COLORS, textInRect, type Annotation, type HighlightColor, type Rect } from '@/lib/shared/annotations';

const COLOR_NAMES: Record<HighlightColor, string> = { yellow: 'Yellow', green: 'Green', blue: 'Blue', pink: 'Pink' };

/** This file's highlights, bookmarks and notes, with optimistic updates. */
export function useAnnotations(file: string) {
  const [items, setItems] = useState<Annotation[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/annotations?file=${encodeURIComponent(file)}`)
      .then((r) => r.json())
      .then((j: { data?: Annotation[] }) => !cancelled && setItems(j.data ?? []))
      .catch(() => !cancelled && setError('Couldn’t load your highlights.'));
    return () => {
      cancelled = true;
    };
  }, [file]);

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : 'Something went wrong saving that.');

  const create = useCallback(
    async (a: { page: number; kind: 'highlight' | 'note'; rect?: Rect; color?: HighlightColor; note?: string; text?: string }) => {
      try {
        const saved = await api<Annotation>('/api/annotations', { body: { file, ...a } });
        setItems((xs) => [...xs, saved]);
        return saved;
      } catch (e) {
        fail(e);
        return null;
      }
    },
    [file],
  );

  const update = useCallback(async (id: string, patch: { note?: string | null; color?: HighlightColor }) => {
    setItems((xs) => xs.map((x) => (x.id === id ? { ...x, ...patch, note: patch.note === undefined ? x.note : patch.note } : x)));
    try {
      await api(`/api/annotations/${id}`, { method: 'PATCH', body: patch });
    } catch (e) {
      fail(e);
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    setItems((xs) => xs.filter((x) => x.id !== id));
    try {
      await api(`/api/annotations/${id}`, { method: 'DELETE', body: {} });
    } catch (e) {
      fail(e);
    }
  }, []);

  const toggleBookmark = useCallback(
    async (page: number) => {
      const had = items.find((x) => x.kind === 'bookmark' && x.page === page);
      setItems((xs) =>
        had
          ? xs.filter((x) => x.id !== had.id)
          : [...xs, { id: `tmp-${page}`, file, identifier: null, page, kind: 'bookmark', rect: null, color: null, note: null, text: null, createdAt: Date.now(), updatedAt: Date.now() }],
      );
      try {
        const res = await api<{ bookmark: Annotation | null }>('/api/annotations/bookmark', { body: { file, page } });
        // Swap the placeholder for the saved bookmark so it can be named straight away.
        if (res.bookmark) setItems((xs) => xs.map((x) => (x.id === `tmp-${page}` ? res.bookmark! : x)));
      } catch (e) {
        fail(e);
      }
    },
    [file, items],
  );

  return { items, error, create, update, remove, toggleBookmark, clearError: () => setError(null) };
}

/** Text items of a page with their positions as fractions of the page (for capturing text under a box). */
async function pageTextItems(doc: PDFDocumentProxy, n: number) {
  const page = await doc.getPage(n);
  const vp = page.getViewport({ scale: 1 });
  const content = await page.getTextContent();
  return content.items.flatMap((item) => {
    if (!('str' in item) || !item.str.trim()) return [];
    const [x, y] = vp.convertToViewportPoint(item.transform[4] as number, item.transform[5] as number) as [number, number];
    // The anchor is the baseline; the glyphs' vertical centre sits about half a line height above it.
    const h = Math.abs((item.transform[3] as number) || 10);
    const w = Math.abs(item.width) * vp.scale;
    return [{ str: item.str, x: x / vp.width, y: (y - h * 0.4) / vp.height, w: w / vp.width }];
  });
}

/**
 * Highlights over the current page. In highlight mode, dragging draws a new box; otherwise clicking
 * a box opens its editor (note, colour, delete).
 */
export function PageAnnotations({
  doc,
  page,
  drawing,
  annotations,
  onCreated,
  onLookup,
}: {
  doc: PDFDocumentProxy | null;
  page: number;
  drawing: boolean;
  annotations: ReturnType<typeof useAnnotations>;
  onCreated: () => void;
  /** Look up a word clicked in a highlight's captured text. */
  onLookup?: (word: string) => void;
}) {
  const layer = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const highlights = annotations.items.filter((a) => a.kind === 'highlight' && a.page === page && a.rect);

  useEffect(() => setEditing(null), [page]);

  const at = (e: React.PointerEvent) => {
    const r = layer.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };

  async function finish() {
    if (!draft) return;
    const rect: Rect = {
      x: Math.min(draft.x0, draft.x1),
      y: Math.min(draft.y0, draft.y1),
      w: Math.abs(draft.x1 - draft.x0),
      h: Math.abs(draft.y1 - draft.y0),
    };
    setDraft(null);
    if (rect.w < 0.015 || rect.h < 0.008) return; // a click, not a box
    const text = doc ? await pageTextItems(doc, page).then((items) => textInRect(items, rect)).catch(() => '') : '';
    const saved = await annotations.create({ page, kind: 'highlight', rect, color: 'yellow', text: text || undefined });
    if (saved) {
      setEditing(saved.id);
      onCreated();
    }
  }

  const draftRect = draft && {
    left: `${Math.min(draft.x0, draft.x1) * 100}%`,
    top: `${Math.min(draft.y0, draft.y1) * 100}%`,
    width: `${Math.abs(draft.x1 - draft.x0) * 100}%`,
    height: `${Math.abs(draft.y1 - draft.y0) * 100}%`,
  };

  return (
    <div
      ref={layer}
      // Outside highlight mode the layer lets clicks through to the selectable text underneath.
      className={cn('absolute inset-0', drawing ? 'cursor-crosshair touch-none' : 'pointer-events-none')}
      onPointerDown={(e) => {
        if (!drawing || e.button !== 0) return;
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = at(e);
        setDraft({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      }}
      onPointerMove={(e) => {
        if (!draft) return;
        const p = at(e);
        setDraft((d) => (d ? { ...d, x1: p.x, y1: p.y } : d));
      }}
      onPointerUp={() => void finish()}
      onClick={(e) => drawing && e.stopPropagation()}
    >
      {highlights.map((a) => (
        <button
          key={a.id}
          type="button"
          aria-label={`Highlight on page ${a.page}${a.note ? `: ${a.note}` : ''}`}
          onClick={(e) => {
            e.stopPropagation();
            if (!drawing) setEditing(editing === a.id ? null : a.id);
          }}
          className={cn('absolute rounded-[2px] mix-blend-multiply', drawing ? 'pointer-events-none' : 'pointer-events-auto cursor-pointer', editing === a.id && 'ring-2 ring-accent')}
          style={{ left: `${a.rect!.x * 100}%`, top: `${a.rect!.y * 100}%`, width: `${a.rect!.w * 100}%`, height: `${a.rect!.h * 100}%`, background: COLOR_FILL[a.color ?? 'yellow'] }}
        />
      ))}
      {draftRect ? <div className="pointer-events-none absolute rounded-[2px] border-2 border-accent bg-[rgb(250_214_60/0.3)]" style={draftRect} /> : null}
      {highlights
        .filter((a) => a.id === editing)
        .map((a) => (
          <HighlightEditor key={a.id} annotation={a} annotations={annotations} onClose={() => setEditing(null)} onLookup={onLookup} />
        ))}
    </div>
  );
}

function HighlightEditor({
  annotation: a,
  annotations,
  onClose,
  onLookup,
}: {
  annotation: Annotation;
  annotations: ReturnType<typeof useAnnotations>;
  onClose: () => void;
  onLookup?: (word: string) => void;
}) {
  const [note, setNote] = useState(a.note ?? '');
  const below = a.rect!.y + a.rect!.h < 0.7;
  const save = () => {
    if ((a.note ?? '') !== note.trim()) void annotations.update(a.id, { note: note.trim() || null });
  };
  return (
    <div
      role="dialog"
      aria-label="Edit highlight"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      className="pointer-events-auto absolute z-10 w-[min(22rem,90%)] rounded-lg border border-rule bg-panel p-3 text-ink shadow-[0_16px_40px_-16px_rgb(0_0_0/0.5)]"
      style={{
        left: `${Math.min(a.rect!.x, 0.55) * 100}%`,
        ...(below ? { top: `calc(${(a.rect!.y + a.rect!.h) * 100}% + 8px)` } : { bottom: `calc(${(1 - a.rect!.y) * 100}% + 8px)` }),
      }}
    >
      {a.text ? (
        <p className="mb-2 line-clamp-3 border-l-2 border-rule pl-2 text-sm text-ink-soft">
          {onLookup
            ? a.text.split(/(\s+)/).map((w, i) =>
                /\S/.test(w) ? (
                  <button key={i} type="button" onClick={() => onLookup(w)} title={`Look up ${w}`} className="rounded-[2px] hover:bg-accent-wash hover:text-ink">
                    {w}
                  </button>
                ) : (
                  w
                ),
              )
            : a.text}
        </p>
      ) : null}
      <label className="sr-only" htmlFor={`note-${a.id}`}>
        Note
      </label>
      <textarea
        id={`note-${a.id}`}
        autoFocus
        rows={3}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            save();
            onClose();
          }
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            save();
            onClose();
          }
        }}
        placeholder="Add a note (optional)"
        className="w-full resize-none rounded-md border border-rule bg-paper p-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
      />
      <div className="mt-2 flex items-center gap-2">
        <div role="radiogroup" aria-label="Colour" className="flex gap-1.5">
          {HIGHLIGHT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={a.color === c}
              aria-label={COLOR_NAMES[c]}
              onClick={() => void annotations.update(a.id, { color: c })}
              className={cn('keep-round size-7 rounded-full border-2', a.color === c ? 'border-ink' : 'border-transparent')}
              style={{ background: COLOR_SOLID[c] }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            void annotations.remove(a.id);
            onClose();
          }}
          className="ml-auto inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-sm text-ink-soft hover:text-danger"
        >
          <Trash2 aria-hidden className="size-4" /> Delete
        </button>
        <button
          type="button"
          onClick={() => {
            save();
            onClose();
          }}
          className="inline-flex min-h-9 items-center rounded-full bg-accent px-3.5 text-sm font-medium text-accent-ink"
        >
          Done
        </button>
      </div>
    </div>
  );
}

/** The book's bookmarks, highlights and notes by page; add a page note; export as Markdown. */
export function NotesPanel({
  file,
  page,
  annotations,
  onGo,
  onClose,
}: {
  file: string;
  page: number;
  annotations: ReturnType<typeof useAnnotations>;
  onGo: (page: number) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState('');
  const list = [...annotations.items].sort((a, b) => a.page - b.page || a.createdAt - b.createdAt);
  return (
    <SidePanel
      title="Highlights & notes"
      onClose={onClose}
      footer={
        <div className="flex items-center justify-between">
          <a href={`/api/annotations/export?file=${encodeURIComponent(file)}`} className="inline-flex items-center gap-1.5 text-accent hover:underline">
            <Download aria-hidden className="size-4" /> Export as Markdown
          </a>
          <a href="/notes" className="text-ink-soft hover:text-ink">
            All highlights
          </a>
        </div>
      }
    >
      <form
        className="border-b border-rule p-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          void annotations.create({ page, kind: 'note', note: draft.trim() });
          setDraft('');
        }}
      >
        <label htmlFor="page-note" className="text-sm text-ink-soft">
          Note on page {page}
        </label>
        <textarea
          id="page-note"
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="mt-1 w-full resize-none rounded-md border border-rule bg-paper p-2 text-sm text-ink focus:border-accent focus:outline-none"
        />
        <button type="submit" disabled={!draft.trim()} className="mt-2 rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-accent-ink disabled:opacity-40">
          Add note
        </button>
      </form>
      <ol className="min-h-0 flex-1 divide-y divide-rule overflow-y-auto">
        {list.length === 0 ? (
          <li className="p-4 text-sm text-ink-soft">
            Nothing yet. Use the highlighter to draw a box around a passage, or bookmark a page.
          </li>
        ) : (
          list.map((a) => (
            <li key={a.id}>
              <button type="button" onClick={() => onGo(a.page)} className="block w-full px-4 py-3 text-left hover:bg-raised">
                <span className="flex items-center gap-2 text-xs text-ink-faint">
                  {a.kind === 'bookmark' ? <Bookmark className="size-3.5" /> : a.kind === 'note' ? <StickyNote className="size-3.5" /> : (
                    <span className="keep-round inline-block size-3 rounded-full" style={{ background: COLOR_SOLID[a.color ?? 'yellow'] }} />
                  )}
                  Page {a.page}
                  {a.kind === 'bookmark' ? ', bookmark' : a.kind === 'note' ? ', note' : ''}
                </span>
                {a.text ? (
                  <span className="mt-1.5 line-clamp-3 border-l-2 pl-2 text-sm text-ink" style={{ borderColor: COLOR_SOLID[a.color ?? 'yellow'] }}>
                    {a.text}
                  </span>
                ) : null}
                {a.note ? <span className="mt-1 line-clamp-3 block text-sm text-ink-soft">{a.kind === 'bookmark' ? `“${a.note}”` : a.note}</span> : null}
                {a.kind === 'highlight' && !a.text && !a.note ? <span className="mt-1 block text-sm text-ink-faint">Highlighted area</span> : null}
              </button>
            </li>
          ))
        )}
      </ol>
      {annotations.error ? (
        <p role="alert" className="border-t border-rule px-4 py-2 text-sm text-danger">
          {annotations.error}
        </p>
      ) : null}
    </SidePanel>
  );
}

export { Bookmark, Highlighter, StickyNote };
