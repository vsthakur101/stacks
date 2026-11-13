import Link from 'next/link';
import { SearchBox } from '@/components/SearchBox';
import { ItemTile, TileGrid, WorkTile } from '@/components/Tiles';
import { childCollections } from '@/lib/server/catalog/archive';
import { searchWorks } from '@/lib/server/catalog/openLibrary';
import { attempt } from '@/lib/server/pageParams';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const [classics, computing] = await Promise.all([
    attempt(() => searchWorks({ query: 'subject_key:classic_literature', pageSize: 6, sort: 'editions' })),
    attempt(() => childCollections('computermagazines')),
  ]);

  return (
    <div>
      <section className="max-w-3xl pt-6 pb-16 sm:pt-12">
        <h1 className="font-serif text-4xl leading-[1.1] text-ink sm:text-[3.6rem]">What would you like to read?</h1>
        <div className="mt-10">
          <SearchBox action="/search" placeholder="Search titles, authors, publications" size="lg" autoFocus />
        </div>
      </section>

      {classics && classics.results.length > 0 ? (
        <section className="border-t border-rule pt-10 pb-14">
          <div className="mb-8 flex items-baseline justify-between gap-4">
            <h2 className="font-serif text-2xl text-ink">Classics, free to read</h2>
            <Link href="/subjects/classic_literature" className="text-sm text-ink-soft hover:text-accent">
              More classics
            </Link>
          </div>
          <TileGrid>
            {classics.results.map((w) => (
              <WorkTile key={w.workId} work={w} />
            ))}
          </TileGrid>
        </section>
      ) : null}

      {computing && computing.results.length > 0 ? (
        <section className="border-t border-rule pt-10">
          <div className="mb-8 flex items-baseline justify-between gap-4">
            <h2 className="font-serif text-2xl text-ink">Old computer magazines</h2>
            <Link href="/magazines/computermagazines" className="text-sm text-ink-soft hover:text-accent">
              All of them
            </Link>
          </div>
          <TileGrid>
            {computing.results.slice(0, 6).map((c) => (
              <ItemTile key={c.identifier} card={c} section="magazines" />
            ))}
          </TileGrid>
        </section>
      ) : null}
    </div>
  );
}
