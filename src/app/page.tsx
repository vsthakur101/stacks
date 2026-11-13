import Link from 'next/link';
import { Suspense } from 'react';
import { SearchBox } from '@/components/SearchBox';
import { ClearHistoryButton, RemoveShelfButton } from '@/components/ShelfButtons';
import { SectionSkeleton } from '@/components/Skeletons';
import { ItemTile, TileGrid, WorkTile } from '@/components/Tiles';
import { loadShelf, SHELVES, type Shelf } from '@/lib/server/catalog/shelves';
import { attempt } from '@/lib/server/pageParams';
import { listShelves, recentSearches, runShelf, type SavedShelf, type ShelfResults } from '@/lib/server/search/library';

export const dynamic = 'force-dynamic';

/**
 * The heading, search box and recent searches come from the local database and render at once.
 * Every shelf streams in on its own, so one slow source never holds up the page.
 */
export default function Home() {
  const recent = recentSearches();
  const saved = listShelves();

  return (
    <div>
      <section className="pt-4 pb-14 sm:pt-10 sm:pb-16">
        <h1 className="max-w-4xl font-serif text-3xl text-ink sm:text-5xl">What would you like to read?</h1>
        <div className="mt-10 max-w-3xl">
          <SearchBox action="/search" placeholder="mahabharat, Pride and Prejudice, BYTE 1985" size="lg" autoFocus />
        </div>
        {recent.length > 0 ? (
          <div className="mt-6 flex max-w-4xl flex-wrap items-center gap-2 text-sm">
            <span className="mr-1 text-ink-faint">Recent</span>
            {recent.map((r) => (
              <Link
                key={r.href}
                href={r.href}
                className="inline-flex items-baseline gap-1.5 rounded-full border border-rule px-3 py-1 text-ink hover:border-accent"
              >
                <span className="font-serif text-[1.02rem]">{r.label}</span>
                {r.detail ? <span className="text-xs text-ink-faint">{r.detail}</span> : null}
              </Link>
            ))}
            <span className="ml-2">
              <ClearHistoryButton />
            </span>
          </div>
        ) : null}
      </section>

      {saved.map((shelf) => (
        <Suspense key={shelf.id} fallback={<SectionSkeleton title={shelf.title} />}>
          <SavedShelfRow shelf={shelf} />
        </Suspense>
      ))}
      {SHELVES.map((shelf) => (
        <Suspense key={shelf.title} fallback={<SectionSkeleton title={shelf.title} />}>
          <CuratedShelfRow shelf={shelf} />
        </Suspense>
      ))}
    </div>
  );
}

async function SavedShelfRow({ shelf }: { shelf: SavedShelf }) {
  const results = await attempt(() => runShelf(shelf));
  return (
    <ShelfRow
      title={shelf.title}
      more={shelf.href}
      remove={<RemoveShelfButton id={shelf.id} title={shelf.title} />}
      results={results}
      emptyText={results ? 'Nothing matches this search right now.' : 'Couldn’t load this shelf. It will try again next time.'}
    />
  );
}

async function CuratedShelfRow({ shelf }: { shelf: Shelf }) {
  const loaded = await attempt(() => loadShelf(shelf));
  if (!loaded || loaded.results.length === 0) return null;
  const results: ShelfResults =
    loaded.shelf.kind === 'works'
      ? { kind: 'works', results: loaded.results as Extract<ShelfResults, { kind: 'works' }>['results'] }
      : { kind: 'items', section: 'books', results: loaded.results as Extract<ShelfResults, { kind: 'items' }>['results'] };
  return <ShelfRow title={shelf.title} more={shelf.more} results={results} />;
}

function ShelfRow({
  title,
  more,
  remove,
  results,
  emptyText,
}: {
  title: string;
  more?: string;
  remove?: React.ReactNode;
  results: ShelfResults | null;
  emptyText?: string;
}) {
  const empty = !results || results.results.length === 0;
  return (
    <section className="border-t border-rule pt-10 pb-14">
      <div className="mb-8 flex items-baseline justify-between gap-4">
        <h2 className="flex items-center gap-2 font-serif text-2xl text-ink">
          {title}
          {remove}
        </h2>
        {more ? (
          <Link href={more} className="shrink-0 text-sm text-ink-soft underline-offset-4 hover:text-accent hover:underline">
            See more
          </Link>
        ) : null}
      </div>
      {empty ? (
        <p className="text-ink-soft">{emptyText}</p>
      ) : (
        <TileGrid shelf>
          {results.kind === 'works'
            ? results.results.map((w) => <WorkTile key={w.workId} work={w} />)
            : results.results.map((c) => <ItemTile key={c.identifier} card={c} section={results.section} />)}
        </TileGrid>
      )}
    </section>
  );
}
