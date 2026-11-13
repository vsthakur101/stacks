import type { Metadata } from 'next';
import Link from 'next/link';
import { Pager } from '@/components/Pager';
import { SearchBox } from '@/components/SearchBox';
import { Segmented } from '@/components/Segmented';
import { SelectAllButton } from '@/components/SelectToggle';
import { Empty, PageHeading, StaleNotice, Unreachable } from '@/components/States';
import { ItemTile, itemToTray, TileGrid, WorkTile } from '@/components/Tiles';
import { searchTexts } from '@/lib/server/catalog/archive';
import { escapeLucene } from '@/lib/server/catalog/normalize';
import { olText, searchWorks } from '@/lib/server/catalog/openLibrary';
import { SECTIONS } from '@/lib/server/catalog/sections';
import { attempt, pageNum, str, type SearchParams } from '@/lib/server/pageParams';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Books' };

const SUBJECTS = [
  ['classic_literature', 'Classic literature'],
  ['science_fiction', 'Science fiction'],
  ['history', 'History'],
  ['philosophy', 'Philosophy'],
  ['poetry', 'Poetry'],
  ['mathematics', 'Mathematics'],
  ['detective_and_mystery_stories', 'Mystery'],
  ['travel', 'Travel'],
  ['biography', 'Biography'],
  ['science', 'Science'],
  ['religion', 'Religion'],
  ['children', 'Children’s books'],
  ['vedanta', 'Vedanta'],
  ['sanskrit_literature', 'Sanskrit literature'],
  ['hindi_literature', 'Hindi literature'],
] as const;

type Source = 'catalogue' | 'archive';

/** Builds a /books URL that keeps the query and only the params that apply. */
function booksHref(q: string, source: Source, borrow = false): string {
  const p = new URLSearchParams({ q });
  if (source === 'archive') p.set('source', 'archive');
  if (source === 'catalogue' && borrow) p.set('borrow', '1');
  return `/books?${p}`;
}

export default async function BooksPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = str(sp.q);
  const page = pageNum(sp.page);
  const source: Source = str(sp.source) === 'archive' ? 'archive' : 'catalogue';
  const borrow = source === 'catalogue' && str(sp.borrow) === '1';

  return (
    <>
      <PageHeading title={SECTIONS.books.name} lede={SECTIONS.books.tagline} />
      <div className="mb-6 max-w-2xl">
        <SearchBox
          action="/books"
          placeholder="Title, author or subject, in any script"
          defaultValue={q}
          hidden={source === 'archive' ? { source: 'archive' } : borrow ? { borrow: '1' } : undefined}
        />
      </div>
      {q ? (
        <SearchResults q={q} page={page} source={source} borrow={borrow} />
      ) : (
        <Browse page={page} />
      )}
    </>
  );
}

async function Browse({ page }: { page: number }) {
  const results = await attempt(() => searchWorks({ query: 'subject_key:classic_literature', page, sort: 'editions' }));
  return (
    <>
      <div className="mb-12 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-soft">
        <span className="text-ink-faint">Browse by subject</span>
        {SUBJECTS.map(([slug, name]) => (
          <Link key={slug} href={`/subjects/${slug}`} className="underline-offset-4 hover:text-accent hover:underline">
            {name}
          </Link>
        ))}
      </div>
      {!results ? (
        <Unreachable what="books" />
      ) : (
        <>
          <StaleNotice stale={results.stale} />
          <h2 className="mb-6 font-serif text-xl text-ink">Most-published classics</h2>
          <TileGrid>
            {results.results.map((w) => (
              <WorkTile key={w.workId} work={w} />
            ))}
          </TileGrid>
          <Pager path="/books" params={{}} page={page} total={results.total} pageSize={results.pageSize} />
        </>
      )}
    </>
  );
}

/**
 * Two sources behind one search box. Open Library has clean, grouped records but only for books it has
 * catalogued; archive.org has every scan, including many Indic texts Open Library has never heard of.
 * Both counts are always shown, so the other source is never invisible.
 */
async function SearchResults({ q, page, source, borrow }: { q: string; page: number; source: Source; borrow: boolean }) {
  const ol = olText(q);
  const lucene = escapeLucene(q);
  const [catalogue, archive] = await Promise.all([
    ol
      ? attempt(() => searchWorks({ query: ol, page: source === 'catalogue' ? page : 1, pageSize: source === 'catalogue' ? 24 : 1, includeBorrowable: borrow }))
      : Promise.resolve(null),
    attempt(() => searchTexts(lucene, source === 'archive' ? page : 1, source === 'archive' ? 24 : 0)),
  ]);

  const count = (n: number | undefined) => (n === undefined ? '' : ` (${n.toLocaleString('en')})`);

  return (
    <>
      <div className="mb-10 flex flex-wrap items-center gap-3">
        <Segmented
          label="Where to search"
          options={[
            { label: `Catalogued books${count(catalogue?.total)}`, href: booksHref(q, 'catalogue', borrow), current: source === 'catalogue' },
            { label: `All scans on archive.org${count(archive?.total)}`, href: booksHref(q, 'archive'), current: source === 'archive' },
          ]}
        />
        {source === 'catalogue' ? (
          <Segmented
            label="Which books"
            options={[
              { label: 'Free to read', href: booksHref(q, 'catalogue', false), current: !borrow },
              { label: 'Include borrow-only', href: booksHref(q, 'catalogue', true), current: borrow },
            ]}
          />
        ) : null}
      </div>

      {source === 'catalogue' ? (
        !catalogue ? (
          <Unreachable what="books" />
        ) : catalogue.results.length === 0 ? (
          <Empty title={`No catalogued books for “${q}”.`}>
            {archive && archive.total > 0 ? (
              <p>
                archive.org has {archive.total.toLocaleString('en')} scans that match.{' '}
                <Link href={booksHref(q, 'archive')} className="text-accent underline underline-offset-4">
                  Show them
                </Link>
                .
              </p>
            ) : (
              <p>{borrow ? 'Try different words.' : 'Try different words, or include borrow-only books.'}</p>
            )}
          </Empty>
        ) : (
          <>
            <StaleNotice stale={catalogue.stale} />
            <h2 className="mb-6 font-serif text-xl text-ink">{catalogue.total.toLocaleString('en')} books</h2>
            <TileGrid>
              {catalogue.results.map((w) => (
                <WorkTile key={w.workId} work={w} />
              ))}
            </TileGrid>
            <Pager path="/books" params={{ q, borrow: borrow ? '1' : undefined }} page={page} total={catalogue.total} pageSize={catalogue.pageSize} />
          </>
        )
      ) : !archive ? (
        <Unreachable what="archive.org results" />
      ) : archive.results.length === 0 ? (
        <Empty title={`Nothing on archive.org for “${q}”.`}>
          <p>Try fewer words, or a different spelling. Titles are often transliterated several ways.</p>
        </Empty>
      ) : (
        <>
          <StaleNotice stale={archive.stale} />
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="font-serif text-xl text-ink">{archive.total.toLocaleString('en')} scans, best match first</h2>
            <SelectAllButton items={archive.results.map((c) => itemToTray(c, 'books'))} label="this page to the slip" />
          </div>
          <TileGrid>
            {archive.results.map((c) => (
              <ItemTile key={c.identifier} card={c} section="books" />
            ))}
          </TileGrid>
          <Pager path="/books" params={{ q, source: 'archive' }} page={page} total={archive.total} pageSize={archive.pageSize} />
        </>
      )}
    </>
  );
}
