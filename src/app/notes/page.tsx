import { Bookmark, Download, StickyNote } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchBox } from '@/components/SearchBox';
import { Empty, PageHeading } from '@/components/States';
import { allAnnotations } from '@/lib/server/library/annotations';
import { titleForFile } from '@/lib/server/library/bookTitle';
import { findLibraryFile } from '@/lib/server/library/scan';
import { str, type SearchParams } from '@/lib/server/pageParams';
import { getSettings } from '@/lib/server/settings';
import { COLOR_SOLID, type Annotation } from '@/lib/shared/annotations';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Highlights & notes' };

/** Every highlight, bookmark and note, grouped by book, searchable, exportable. */
export default async function NotesPage({ searchParams }: { searchParams: SearchParams }) {
  const q = str((await searchParams).q)?.toLocaleLowerCase();
  const root = getSettings().downloadRoot;
  const all = allAnnotations().filter((a) => !q || `${a.text ?? ''} ${a.note ?? ''}`.toLocaleLowerCase().includes(q));

  const byFile = new Map<string, Annotation[]>();
  for (const a of all) byFile.set(a.file, [...(byFile.get(a.file) ?? []), a]);
  const books = await Promise.all(
    [...byFile.entries()].map(async ([file, list]) => ({
      file,
      title: (await titleForFile(root, file)).title,
      present: Boolean(await findLibraryFile(root, file)),
      latest: Math.max(...list.map((a) => a.updatedAt)),
      list: list.sort((a, b) => a.page - b.page || a.createdAt - b.createdAt),
    })),
  );
  books.sort((a, b) => b.latest - a.latest);

  return (
    <>
      <PageHeading title="Highlights & notes" lede={all.length ? `${all.length} across ${books.length} ${books.length === 1 ? 'book' : 'books'}` : undefined} />
      <div className="mb-10 flex max-w-3xl flex-wrap items-end gap-x-8 gap-y-3">
        <div className="min-w-64 flex-1">
          <SearchBox action="/notes" placeholder="Search your notes and highlighted text" defaultValue={q} />
        </div>
        {all.length ? (
          <a href="/api/annotations/export" className="inline-flex min-h-10 items-center gap-1.5 text-sm text-accent hover:underline">
            <Download aria-hidden className="size-4" /> Export all as Markdown
          </a>
        ) : null}
      </div>

      {books.length === 0 ? (
        <Empty title={q ? 'No notes or highlights match.' : 'No highlights or notes yet.'}>
          <p>
            Open a book from your{' '}
            <Link href="/library" className="text-accent underline underline-offset-4">
              Library
            </Link>
            , press the highlighter (or H) and draw a box around a passage. Bookmarks (B) and page notes appear here too.
          </p>
        </Empty>
      ) : (
        <div className="space-y-12">
          {books.map((b) => (
            <section key={b.file} className="t-section">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
                <h2 className="font-display text-2xl text-ink">{b.title}</h2>
                <span className="text-sm text-ink-soft">
                  {b.list.length} {b.list.length === 1 ? 'entry' : 'entries'}
                  {b.present ? '' : ', file no longer in your download folder'}
                </span>
              </div>
              <ol className="divide-y divide-rule">
                {b.list.map((a) => {
                  const href = `/reader?file=${encodeURIComponent(b.file)}&page=${a.page}`;
                  const body = (
                    <>
                      <span className="flex items-center gap-2 text-sm text-ink-faint">
                        {a.kind === 'bookmark' ? <Bookmark className="size-3.5" /> : a.kind === 'note' ? <StickyNote className="size-3.5" /> : (
                          <span className="keep-round inline-block size-3 rounded-full" style={{ background: COLOR_SOLID[a.color ?? 'yellow'] }} />
                        )}
                        Page {a.page}
                        {a.kind === 'bookmark' ? ', bookmark' : a.kind === 'note' ? ', note' : ''}
                      </span>
                      {a.text ? (
                        <span className="mt-1.5 block max-w-[70ch] border-l-2 pl-3 text-ink" style={{ borderColor: COLOR_SOLID[a.color ?? 'yellow'] }}>
                          {a.text}
                        </span>
                      ) : null}
                      {a.note ? <span className="mt-2 block max-w-[70ch] whitespace-pre-wrap text-ink-soft">{a.note}</span> : null}
                      {a.kind === 'highlight' && !a.text && !a.note ? <span className="mt-1 block text-ink-faint">Highlighted area</span> : null}
                    </>
                  );
                  return (
                    <li key={a.id} className="py-3">
                      {b.present ? (
                        <Link href={href} className="-mx-2 block rounded-md px-2 py-1 hover:bg-raised">
                          {body}
                        </Link>
                      ) : (
                        <div className="py-1">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
