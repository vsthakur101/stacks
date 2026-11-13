import Link from 'next/link';
import { SearchBox } from '@/components/SearchBox';
import { ClearHistoryButton, RemoveShelfButton } from '@/components/ShelfButtons';
import { ItemTile, TileGrid, WorkTile } from '@/components/Tiles';
import { loadShelf, SHELVES } from '@/lib/server/catalog/shelves';
import { attempt } from '@/lib/server/pageParams';
import { listShelves, recentSearches, runShelf, type ShelfResults } from '@/lib/server/search/library';

export const dynamic = 'force-dynamic';

interface ShelfView {
  key: string;
  title: string;
  more?: string;
  removableId?: string;
  results: ShelfResults;
}

export default async function Home() {
  const recent = recentSearches();
  const saved = listShelves();
  const [mine, curated] = await Promise.all([
    Promise.all(saved.map((s) => attempt(() => runShelf(s)).then((r) => ({ shelf: s, r })))),
    Promise.all(SHELVES.map((s) => attempt(() => loadShelf(s)))),
  ]);

  // Your saved searches first, then the curated shelves.
  const views: ShelfView[] = [
    ...mine.flatMap(({ shelf, r }) =>
      r ? [{ key: shelf.id, title: shelf.title, more: shelf.href, removableId: shelf.id, results: r }] : [],
    ),
    ...curated.flatMap((c) =>
      c && c.results.length > 0
        ? [
            {
              key: c.shelf.title,
              title: c.shelf.title,
              more: c.shelf.more,
              results:
                c.shelf.kind === 'works'
                  ? ({ kind: 'works', results: c.results } as ShelfResults)
                  : ({ kind: 'items', section: 'books', results: c.results } as ShelfResults),
            },
          ]
        : [],
    ),
  ];

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

      {views.map((v) => {
        if (v.results.results.length === 0 && !v.removableId) return null;
        return (
          <section key={v.key} className="border-t border-rule pt-10 pb-14">
            <div className="mb-8 flex items-baseline justify-between gap-4">
              <h2 className="flex items-center gap-2 font-serif text-2xl text-ink">
                {v.title}
                {v.removableId ? <RemoveShelfButton id={v.removableId} title={v.title} /> : null}
              </h2>
              {v.more ? (
                <Link href={v.more} className="shrink-0 text-sm text-ink-soft underline-offset-4 hover:text-accent hover:underline">
                  See more
                </Link>
              ) : null}
            </div>
            {v.results.results.length === 0 ? (
              <p className="text-ink-soft">Nothing matches this search right now.</p>
            ) : (
              <TileGrid shelf>
                {v.results.kind === 'works'
                  ? v.results.results.map((w) => <WorkTile key={w.workId} work={w} />)
                  : v.results.results.map((c) => (
                      <ItemTile key={c.identifier} card={c} section={(v.results as Extract<ShelfResults, { kind: 'items' }>).section} />
                    ))}
              </TileGrid>
            )}
          </section>
        );
      })}
    </div>
  );
}
