import Link from 'next/link';
import { SearchBox } from '@/components/SearchBox';
import { ItemTile, TileGrid, WorkTile } from '@/components/Tiles';
import { loadShelf, SHELVES, type LoadedShelf } from '@/lib/server/catalog/shelves';
import { attempt } from '@/lib/server/pageParams';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const shelves = (await Promise.all(SHELVES.map((s) => attempt(() => loadShelf(s))))).filter(
    (s): s is LoadedShelf => s !== null && s.results.length > 0,
  );

  return (
    <div>
      <section className="pt-4 pb-16 sm:pt-10 sm:pb-20">
        <h1 className="max-w-4xl font-serif text-3xl text-ink sm:text-5xl">What would you like to read?</h1>
        <div className="mt-10 max-w-3xl">
          <SearchBox action="/search" placeholder="महाभारत, Pride and Prejudice, BYTE 1985" size="lg" autoFocus />
        </div>
      </section>

      {shelves.map(({ shelf, results }) => (
        <section key={shelf.title} className="border-t border-rule pt-10 pb-14">
          <div className="mb-8 flex items-baseline justify-between gap-4">
            <h2 className="font-serif text-2xl text-ink">{shelf.title}</h2>
            {shelf.more ? (
              <Link href={shelf.more} className="shrink-0 text-sm text-ink-soft underline-offset-4 hover:text-accent hover:underline">
                See more
              </Link>
            ) : null}
          </div>
          <TileGrid shelf>
            {shelf.kind === 'works'
              ? (results as Extract<LoadedShelf, { shelf: { kind: 'works' } }>['results']).map((w) => <WorkTile key={w.workId} work={w} />)
              : (results as Extract<LoadedShelf, { shelf: { kind: 'items' } }>['results']).map((c) => (
                  <ItemTile key={c.identifier} card={c} section="books" />
                ))}
          </TileGrid>
        </section>
      ))}
    </div>
  );
}
