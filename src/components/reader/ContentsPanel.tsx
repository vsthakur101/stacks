'use client';

import { Bookmark } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/client/api';
import { cn } from '@/lib/cn';
import type { Annotation } from '@/lib/shared/annotations';
import type { useAnnotations } from './annotations';
import { fieldClass, SidePanel } from './SidePanel';

interface BookInfo {
  pageOffset: number | null;
  suggestedOffset: number | null;
  searchable: boolean;
}

/** Printed page numbers: offset = PDF page − printed page. */
export function useBookPrefs(file: string) {
  const [offset, setOffsetState] = useState<number | null>(null);
  const [suggested, setSuggested] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<BookInfo>(`/api/book?${new URLSearchParams({ file, suggest: '0' })}`)
      .then((d) => !cancelled && setOffsetState(d.pageOffset))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [file]);

  /** Reads the book's text (once) for a suggestion; called when Contents opens. */
  const checkSuggestion = useCallback(() => {
    if (checked) return;
    setChecked(true);
    api<BookInfo>(`/api/book?${new URLSearchParams({ file, suggest: '1' })}`)
      .then((d) => setSuggested(d.suggestedOffset))
      .catch(() => undefined);
  }, [file, checked]);

  const setOffset = useCallback(
    async (value: number | null) => {
      setOffsetState(value);
      await api('/api/book', { method: 'PATCH', body: { file, pageOffset: value } }).catch(() => undefined);
    },
    [file],
  );

  return { offset, suggested, setOffset, checkSuggestion };
}

export type BookPrefs = ReturnType<typeof useBookPrefs>;

interface OutlineEntry {
  title: string;
  page: number;
  depth: number;
}

/** The PDF's own outline, flattened, with pages resolved. Empty for most scans. */
export function useOutline(doc: PDFDocumentProxy | null) {
  const [entries, setEntries] = useState<OutlineEntry[] | null>(null);
  useEffect(() => {
    if (!doc) return;
    let cancelled = false;
    (async () => {
      const outline = await doc.getOutline().catch(() => null);
      const out: OutlineEntry[] = [];
      const walk = async (items: NonNullable<typeof outline>, depth: number) => {
        for (const item of items) {
          if (out.length >= 500) return;
          try {
            const dest = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest;
            const ref = dest?.[0];
            const index = ref == null ? null : typeof ref === 'number' ? ref : await doc.getPageIndex(ref);
            if (index != null) out.push({ title: item.title.trim() || 'Untitled', page: index + 1, depth });
          } catch {
            // Broken destination: skip the entry.
          }
          if (item.items?.length) await walk(item.items, depth + 1);
        }
      };
      if (outline?.length) await walk(outline, 0);
      if (!cancelled) setEntries(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc]);
  return entries;
}

export function printedLabel(page: number, offset: number | null): string {
  if (offset === null) return `Page ${page}`;
  const printed = page - offset;
  return printed >= 1 ? `p. ${printed}` : `Page ${page}`;
}

export function ContentsPanel({
  doc,
  page,
  total,
  annotations,
  prefs,
  onGo,
  onClose,
}: {
  doc: PDFDocumentProxy | null;
  page: number;
  total: number;
  annotations: ReturnType<typeof useAnnotations>;
  prefs: BookPrefs;
  onGo: (page: number) => void;
  onClose: () => void;
}) {
  const outline = useOutline(doc);
  const bookmarks = annotations.items.filter((a) => a.kind === 'bookmark').sort((a, b) => a.page - b.page);
  const here = bookmarks.find((b) => b.page === page);
  const [printedHere, setPrintedHere] = useState('');
  const [goTo, setGoTo] = useState('');
  const [usePdfNumbers, setUsePdfNumbers] = useState(false);
  const { offset, suggested } = prefs;

  useEffect(() => prefs.checkSuggestion(), [prefs]);

  const printedMode = offset !== null && !usePdfNumbers;
  const goToPage = () => {
    const n = Number(goTo.trim().replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966)));
    if (!Number.isInteger(n) || n < 1) return;
    onGo(printedMode ? n + offset! : n);
    setGoTo('');
  };

  return (
    <SidePanel title="Contents" onClose={onClose}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <form
          className="border-b border-rule p-4"
          onSubmit={(e) => {
            e.preventDefault();
            goToPage();
          }}
        >
          <label htmlFor="goto" className="text-sm text-ink-soft">
            Go to {printedMode ? 'printed page' : 'page'}
          </label>
          <div className="mt-1 flex gap-2">
            <input id="goto" inputMode="numeric" value={goTo} onChange={(e) => setGoTo(e.target.value)} placeholder={printedMode ? `1–${total - offset!}` : `1–${total}`} className={cn(fieldClass, 'tabular-nums')} />
            <button type="submit" disabled={!goTo.trim()} className="shrink-0 rounded-full bg-accent px-4 text-sm font-medium text-accent-ink disabled:opacity-40">
              Go
            </button>
          </div>
          {offset !== null ? (
            <button type="button" onClick={() => setUsePdfNumbers((v) => !v)} className="mt-2 text-sm text-ink-soft underline-offset-4 hover:text-ink hover:underline">
              {usePdfNumbers ? 'Use the book’s printed numbers' : 'Use PDF page numbers instead'}
            </button>
          ) : null}
        </form>

        <section className="border-b border-rule p-4" aria-labelledby="printed-h">
          <h3 id="printed-h" className="text-sm font-medium text-ink">
            Printed page numbers
          </h3>
          {offset !== null ? (
            <div className="mt-1 text-sm text-ink-soft">
              <p>
                This page is printed page {page - offset >= 1 ? page - offset : '— (front matter)'}; PDF pages are {Math.abs(offset)} {offset >= 0 ? 'ahead' : 'behind'}.
              </p>
              <button type="button" onClick={() => void prefs.setOffset(null)} className="mt-1 text-ink-soft underline-offset-4 hover:text-ink hover:underline">
                Stop using printed numbers
              </button>
            </div>
          ) : (
            <>
              {suggested !== null && page - suggested >= 1 ? (
                <div className="mt-2 rounded-md bg-accent-wash p-3 text-sm text-ink">
                  <p>The numbers printed on the pages look {suggested} behind the PDF’s (this page would be printed page {page - suggested}).</p>
                  <button type="button" onClick={() => void prefs.setOffset(suggested)} className="mt-2 rounded-full bg-accent px-3.5 py-1.5 font-medium text-accent-ink">
                    Use printed numbers
                  </button>
                </div>
              ) : null}
              <form
                className="mt-2 text-sm text-ink-soft"
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = Number(printedHere.trim().replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966)));
                  if (Number.isInteger(n) && n >= 1) void prefs.setOffset(page - n);
                  setPrintedHere('');
                }}
              >
                <label htmlFor="printed-here">This page ({page}) is printed page</label>
                <div className="mt-1 flex gap-2">
                  <input id="printed-here" inputMode="numeric" value={printedHere} onChange={(e) => setPrintedHere(e.target.value)} className={cn(fieldClass, 'tabular-nums')} />
                  <button type="submit" disabled={!printedHere.trim()} className="shrink-0 rounded-full border border-rule px-4 text-ink hover:bg-raised disabled:opacity-40">
                    Set
                  </button>
                </div>
                <p className="mt-1 text-ink-faint">Then the book’s own index and references take you to the right page.</p>
              </form>
            </>
          )}
        </section>

        <section className="p-4" aria-labelledby="marks-h">
          <div className="flex items-center justify-between">
            <h3 id="marks-h" className="text-sm font-medium text-ink">
              Your bookmarks
            </h3>
            {!here ? (
              <button type="button" onClick={() => void annotations.toggleBookmark(page)} className="inline-flex items-center gap-1.5 text-sm text-accent hover:underline">
                <Bookmark aria-hidden className="size-3.5" /> Bookmark this page
              </button>
            ) : null}
          </div>
          {bookmarks.length === 0 ? (
            <p className="mt-1 text-sm text-ink-soft">Bookmark the start of each chapter (B) and name it, e.g. “सर्ग ९” or “अध्याय ११”. They become this book’s contents.</p>
          ) : (
            <ol className="mt-2 space-y-1">
              {bookmarks.map((b) => (
                <BookmarkRow key={b.id} bookmark={b} current={b.page === page} offset={offset} annotations={annotations} onGo={onGo} />
              ))}
            </ol>
          )}
        </section>

        {outline && outline.length > 0 ? (
          <section className="border-t border-rule p-4" aria-labelledby="outline-h">
            <h3 id="outline-h" className="text-sm font-medium text-ink">
              From the PDF
            </h3>
            <ol className="mt-2">
              {outline.map((o, i) => (
                <li key={i}>
                  <button type="button" onClick={() => onGo(o.page)} className={cn('flex w-full items-baseline gap-3 rounded-md py-1.5 pr-2 text-left text-sm hover:bg-raised', o.page === page ? 'text-accent' : 'text-ink')} style={{ paddingLeft: `${0.5 + o.depth}rem` }}>
                    <span className="min-w-0 flex-1">{o.title}</span>
                    <span className="shrink-0 tabular-nums text-ink-faint">{printedLabel(o.page, offset)}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </SidePanel>
  );
}

function BookmarkRow({
  bookmark: b,
  current,
  offset,
  annotations,
  onGo,
}: {
  bookmark: Annotation;
  current: boolean;
  offset: number | null;
  annotations: ReturnType<typeof useAnnotations>;
  onGo: (page: number) => void;
}) {
  const [name, setName] = useState(b.note ?? '');
  useEffect(() => setName(b.note ?? ''), [b.note]);
  const save = () => {
    if (name.trim() !== (b.note ?? '') && !b.id.startsWith('tmp-')) void annotations.update(b.id, { note: name.trim() || null });
  };
  return (
    <li className={cn('flex items-center gap-2 rounded-md pl-1', current && 'bg-accent-wash')}>
      <label className="sr-only" htmlFor={`bm-${b.id}`}>
        Name of the bookmark on page {b.page}
      </label>
      <input
        id={`bm-${b.id}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        }}
        placeholder="Name this bookmark"
        className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1.5 text-sm text-ink placeholder:text-ink-faint hover:border-rule focus:border-accent focus:bg-paper focus:outline-none"
      />
      <button type="button" onClick={() => onGo(b.page)} className="shrink-0 rounded-full px-2.5 py-1.5 text-sm tabular-nums text-accent hover:bg-raised">
        {printedLabel(b.page, offset)}
      </button>
    </li>
  );
}
