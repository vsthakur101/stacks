import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { SearchBox } from '@/components/SearchBox';
import { LineSkeleton } from '@/components/Skeletons';
import { Empty, PageHeading } from '@/components/States';
import { titleForFile } from '@/lib/server/library/bookTitle';
import { indexLibrary, indexStatus, searchLibrary } from '@/lib/server/library/librarySearch';
import { scanLibrary } from '@/lib/server/library/scan';
import { str, type SearchParams } from '@/lib/server/pageParams';
import { getSettings } from '@/lib/server/settings';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const q = str((await searchParams).q);
  return { title: q ? `Your books: “${q}”` : 'Search inside your books' };
}

/** Offline search across the text of every downloaded PDF. */
export default async function LibraryInsidePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = str(sp.q)?.slice(0, 200);
  const status = await indexStatus();
  // Books not read yet get read now, in the background; the note below says so.
  if (status.indexed < status.total) void indexLibrary().catch(() => undefined);

  return (
    <>
      <PageHeading title="Search inside your books" lede="Every downloaded PDF, offline and instant. Matches open in the reader at their page." />
      <div className="mb-8 max-w-3xl space-y-3">
        <SearchBox action="/library/inside" placeholder="A word, a name, a line of a verse" defaultValue={q} size="lg" autoFocus={!q} />
        <p className="text-sm text-ink-soft">
          {status.total === 0
            ? 'No PDFs in your library yet.'
            : status.indexed < status.total
              ? `Read ${status.indexed} of your ${status.total} PDFs so far; the rest are being read now and will be included in a minute or two.`
              : `Searching all ${status.total} of your PDFs. Exact matches, ignoring spaces and punctuation; inside one book, Find also catches near-misses from scanning errors.`}{' '}
          <Link href={q ? `/inside?${new URLSearchParams({ q })}` : '/inside'} className="text-accent underline-offset-4 hover:underline">
            Search all of archive.org instead
          </Link>
        </p>
      </div>
      {q ? (
        <Suspense key={q} fallback={<LineSkeleton className="w-1/2" />}>
          <Results q={q} />
        </Suspense>
      ) : null}
    </>
  );
}

async function Results({ q }: { q: string }) {
  const root = getSettings().downloadRoot;
  const scan = await scanLibrary(root);
  const files = new Set([...scan.items.flatMap((i) => i.files), ...scan.others].map((f) => f.relative));
  const result = await searchLibrary(q, { files });
  if (result.books.length === 0) {
    return (
      <Empty title={`“${q}” isn’t in your books’ text.`}>
        <p>Scanned books’ text has errors; try a shorter part of the line, or open a book and use Find (F), which also catches near-misses.</p>
      </Empty>
    );
  }
  const titles = await Promise.all(result.books.map((b) => titleForFile(root, b.file).then((t) => t.title)));
  return (
    <>
      <p className="mb-6 text-ink-soft">
        {result.total.toLocaleString('en')} {result.total === 1 ? 'match' : 'matches'} in {result.books.length} {result.books.length === 1 ? 'book' : 'books'}
        {result.searchedFor.length > 1 ? `, also searching for “${result.searchedFor[1]}”` : ''}
        {result.truncated ? ' (showing the first part)' : ''}.
      </p>
      <ol className="divide-y divide-rule">
        {result.books.map((b, i) => {
          const open = (page: number) => `/reader?${new URLSearchParams({ file: b.file, page: String(page), find: q })}`;
          return (
            <li key={b.file} className="py-6">
              <div className="flex items-baseline justify-between gap-4">
                <Link href={open(b.hits[0]!.page)} className="font-title text-xl text-ink hover:text-accent">
                  {titles[i]}
                </Link>
                <span className="shrink-0 text-sm tabular-nums text-ink-soft">
                  {b.count} {b.count === 1 ? 'match' : 'matches'}
                </span>
              </div>
              <ul className="mt-3 space-y-2">
                {b.hits.map((h, j) => (
                  <li key={j}>
                    <Link href={open(h.page)} className="group block max-w-[72ch] border-l-2 border-rule pl-3 text-ink-soft hover:border-accent">
                      <span className="mr-2 text-sm text-ink-faint group-hover:text-accent">Page {h.page}</span>
                      {h.snippet.before}
                      <mark className="rounded-[2px] bg-[rgb(250_214_60/0.45)] px-0.5 text-ink">{h.snippet.match}</mark>
                      {h.snippet.after}
                    </Link>
                  </li>
                ))}
              </ul>
              {b.count > b.hits.length ? (
                <Link href={open(b.hits[0]!.page)} className="mt-2 inline-block text-sm text-accent hover:underline">
                  All {b.count} in this book
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>
    </>
  );
}
