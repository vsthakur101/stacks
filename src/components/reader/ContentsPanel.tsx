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
  source: 'pdf' | 'ocr' | null;
}

/** Printed page numbers: offset = PDF page − printed page. */
export function useBookPrefs(file: string) {
  const [offset, setOffsetState] = useState<number | null>(null);
  const [suggested, setSuggested] = useState<number | null>(null);
  const [source, setSource] = useState<'pdf' | 'ocr' | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api<BookInfo>(`/api/book?${new URLSearchParams({ file, suggest: '0' })}`)
      .then((d) => {
        if (cancelled) return;
        setOffsetState(d.pageOffset);
        setSource(d.source);
      })
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

  return { offset, suggested, setOffset, checkSuggestion, source, setSource };
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
  file,
  doc,
  page,
  total,
  annotations,
  prefs,
  onGo,
  onClose,
}: {
  file: string;
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

        <VerseJump file={file} page={page} onGo={onGo} />

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

        <HeadingsBuilder file={file} offset={offset} annotations={annotations} onGo={onGo} />

        <TextRecognition file={file} prefs={prefs} />

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

const HEADING_WORDS = ['सर्गः', 'अध्याय', 'अध्यायः', 'पर्व', 'काण्ड', 'स्कन्ध', 'Chapter'];

interface Heading {
  page: number;
  label: string;
}

/** Contents from headings: propose chapter starts from a heading word, add the ticked ones as named bookmarks. */
function HeadingsBuilder({
  file,
  offset,
  annotations,
  onGo,
}: {
  file: string;
  offset: number | null;
  annotations: ReturnType<typeof useAnnotations>;
  onGo: (page: number) => void;
}) {
  const [word, setWord] = useState('');
  const [found, setFound] = useState<Heading[] | null>(null);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function look(w: string) {
    if (!w.trim()) return;
    setWord(w);
    setBusy(true);
    setStatus(null);
    try {
      const d = await api<{ searchable: boolean; headings: Heading[] }>(`/api/headings?${new URLSearchParams({ file, word: w.trim() })}`);
      setFound(d.headings);
      setPicked(new Set(d.headings.map((h) => h.page)));
      if (!d.headings.length) setStatus(d.searchable ? `No headings with “${w.trim()}” found near the tops of pages.` : 'This scan has almost no recognised text, so headings can’t be found.');
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Couldn’t look for headings.');
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    const marks = (found ?? []).filter((h) => picked.has(h.page)).map((h) => ({ page: h.page, name: h.label }));
    if (!marks.length) return;
    setBusy(true);
    try {
      const changed = await api<unknown[]>('/api/annotations/bookmarks', { body: { file, marks } });
      annotations.reload();
      setStatus(`Added ${changed.length} ${changed.length === 1 ? 'bookmark' : 'bookmarks'}${changed.length < marks.length ? ' (pages already bookmarked with a name were kept)' : ''}.`);
      setFound(null);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Couldn’t add the bookmarks.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-t border-rule p-4" aria-labelledby="headings-h">
      <h3 id="headings-h" className="text-sm font-medium text-ink">
        Contents from headings
      </h3>
      <p className="mt-1 text-sm text-ink-soft">Type the word this book’s chapter headings use; Stacks finds where each chapter starts.</p>
      <form
        className="mt-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void look(word);
        }}
      >
        <label htmlFor="heading-word" className="sr-only">
          Heading word
        </label>
        <input id="heading-word" value={word} onChange={(e) => setWord(e.target.value)} placeholder="सर्गः, अध्याय, Chapter" className={fieldClass} autoComplete="off" />
        <button type="submit" disabled={!word.trim() || busy} className="shrink-0 rounded-full border border-rule px-4 text-sm text-ink hover:bg-raised disabled:opacity-40">
          Find
        </button>
      </form>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {HEADING_WORDS.map((w) => (
          <button key={w} type="button" onClick={() => void look(w)} className="keep-round rounded-full border border-rule px-2.5 py-1 text-sm text-ink-soft hover:border-accent hover:text-ink">
            {w}
          </button>
        ))}
      </div>
      {busy ? <p className="mt-2 text-sm text-ink-soft">Reading the book’s text…</p> : null}
      {status ? (
        <p role="status" className="mt-2 text-sm text-ink-soft">
          {status}
        </p>
      ) : null}
      {found && found.length ? (
        <div className="mt-3">
          <ol className="max-h-72 space-y-0.5 overflow-y-auto">
            {found.map((h) => (
              <li key={h.page} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`h-${h.page}`}
                  checked={picked.has(h.page)}
                  onChange={(e) =>
                    setPicked((s) => {
                      const next = new Set(s);
                      if (e.target.checked) next.add(h.page);
                      else next.delete(h.page);
                      return next;
                    })
                  }
                  className="size-4 shrink-0 accent-[var(--accent)]"
                />
                <label htmlFor={`h-${h.page}`} className="min-w-0 flex-1 truncate text-sm text-ink">
                  {h.label}
                </label>
                <button type="button" onClick={() => onGo(h.page)} className="shrink-0 rounded-full px-2 py-1 text-sm tabular-nums text-accent hover:bg-raised">
                  {printedLabel(h.page, offset)}
                </button>
              </li>
            ))}
          </ol>
          <button type="button" onClick={() => void add()} disabled={!picked.size || busy} className="mt-3 rounded-full bg-accent px-4 py-2 text-sm font-medium text-accent-ink disabled:opacity-40">
            Add {picked.size} as bookmarks
          </button>
        </div>
      ) : null}
    </section>
  );
}

/** Go to verse: "47" (next one from here) or "2.47" (chapter 2, chapters being the bookmarks in order). */
function VerseJump({ file, page, onGo }: { file: string; page: number; onGo: (page: number) => void }) {
  const [ref, setRef] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!ref.trim()) return;
    setBusy(true);
    setStatus(null);
    try {
      const d = await api<{ page: number }>(`/api/verse?${new URLSearchParams({ file, ref: ref.trim(), from: String(page) })}`);
      onGo(d.page);
      setStatus(`Verse ${ref.trim()} is on page ${d.page}.`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Couldn’t find that verse.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="border-b border-rule p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void go();
      }}
    >
      <label htmlFor="verse" className="text-sm text-ink-soft">
        Go to verse
      </label>
      <div className="mt-1 flex gap-2">
        <input id="verse" inputMode="decimal" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="47, or 2.47 for chapter 2" className={cn(fieldClass, 'tabular-nums')} autoComplete="off" />
        <button type="submit" disabled={!ref.trim() || busy} className="shrink-0 rounded-full border border-rule px-4 text-sm text-ink hover:bg-raised disabled:opacity-40">
          Go
        </button>
      </div>
      <p role="status" className="mt-1 text-sm text-ink-soft">
        {busy ? 'Looking…' : (status ?? 'Finds the verse’s closing number (॥ ४७ ॥). Chapters are your bookmarks, in order.')}
      </p>
    </form>
  );
}

type OcrState =
  | { status: 'idle' }
  | { status: 'queued' | 'running'; done: number; total: number }
  | { status: 'done'; pages: number }
  | { status: 'failed'; message: string };

/** Better text for poor scans: recognise the page images on this Mac (Apple Vision, offline). */
function TextRecognition({ file, prefs }: { file: string; prefs: BookPrefs }) {
  const [info, setInfo] = useState<{ available: boolean; state: OcrState; source: 'pdf' | 'ocr' | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const d = await api<{ available: boolean; state: OcrState; source: 'pdf' | 'ocr' | null }>(`/api/ocr?${new URLSearchParams({ file })}`);
        if (cancelled) return;
        setInfo(d);
        if (d.source) prefs.setSource(d.source);
        if (d.state.status === 'queued' || d.state.status === 'running') timer = setTimeout(() => void poll(), 2000);
      } catch {
        /* the section just stays as it is */
      }
    };
    void poll();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // Restarted by `start` below through a new state object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, info?.state.status === 'queued']);

  async function start() {
    setError(null);
    try {
      const d = await api<{ state: OcrState }>('/api/ocr', { body: { file } });
      setInfo((i) => (i ? { ...i, state: d.state } : i));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Couldn’t start.');
    }
  }
  async function stop() {
    await api('/api/ocr', { method: 'DELETE', body: { file } }).catch(() => undefined);
  }

  if (!info?.available) return null;
  const s = info.state;
  return (
    <section className="border-t border-rule p-4" aria-labelledby="ocr-h">
      <h3 id="ocr-h" className="text-sm font-medium text-ink">
        Text recognition
      </h3>
      {s.status === 'running' || s.status === 'queued' ? (
        <div className="mt-1 text-sm text-ink-soft" aria-live="polite">
          <p>{s.status === 'queued' || !s.total ? 'Starting… (the first time takes a minute)' : `Reading page ${s.done} of ${s.total}…`}</p>
          {s.total ? <progress value={s.done} max={s.total} className="mt-2 h-1.5 w-full accent-[var(--accent)]" /> : null}
          <button type="button" onClick={() => void stop()} className="mt-2 text-ink-soft underline-offset-4 hover:text-ink hover:underline">
            Stop
          </button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-soft">
            {info.source === 'ocr' || s.status === 'done'
              ? `This book’s text was recognised on this Mac${s.status === 'done' ? ` (${s.pages} pages)` : ''}. Find, Library search and Read aloud use it.`
              : 'Scans often carry poor or no text. Your Mac can read the page images itself (Hindi, Marathi, Sanskrit in Devanagari, and English), offline. A 300-page book takes a few minutes.'}
          </p>
          {s.status === 'failed' ? <p className="mt-1 text-sm text-danger">{s.message}</p> : null}
          {error ? <p className="mt-1 text-sm text-danger">{error}</p> : null}
          <button type="button" onClick={() => void start()} className="mt-2 rounded-full border border-rule px-4 py-1.5 text-sm text-ink hover:bg-raised">
            {info.source === 'ocr' || s.status === 'done' ? 'Recognise again' : 'Recognise the text'}
          </button>
        </>
      )}
    </section>
  );
}
