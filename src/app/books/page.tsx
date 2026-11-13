import type { Metadata } from 'next';
import Link from 'next/link';
import { Pager } from '@/components/Pager';
import { SearchBox } from '@/components/SearchBox';
import { Empty, PageHeading, StaleNotice, Unreachable } from '@/components/States';
import { TileGrid, WorkTile } from '@/components/Tiles';
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
] as const;

export default async function BooksPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = str(sp.q);
  const page = pageNum(sp.page);
  const borrow = str(sp.borrow) === '1';
  const text = q ? olText(q) : '';
  const results = text
    ? await attempt(() => searchWorks({ query: text, page, includeBorrowable: borrow }))
    : await attempt(() => searchWorks({ query: 'subject_key:classic_literature', page, sort: 'editions' }));

  return (
    <>
      <PageHeading title={SECTIONS.books.name} lede={SECTIONS.books.tagline} />
      <div className="mb-6 max-w-2xl">
        <SearchBox action="/books" placeholder="Title, author or subject" defaultValue={q} hidden={borrow ? { borrow: '1' } : undefined} />
      </div>
      <div className="mb-10 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-soft">
        {q ? (
          <Link
            href={`/books?q=${encodeURIComponent(q)}${borrow ? '' : '&borrow=1'}`}
            className="underline-offset-4 hover:text-accent hover:underline"
            role="switch"
            aria-checked={borrow}
          >
            {borrow ? 'Showing borrow-only books too. Show free only' : 'Showing free books only. Include borrow-only'}
          </Link>
        ) : (
          <>
            <span>Browse by subject:</span>
            {SUBJECTS.map(([slug, name]) => (
              <Link key={slug} href={`/subjects/${slug}`} className="hover:text-accent">
                {name}
              </Link>
            ))}
          </>
        )}
      </div>

      {!results ? (
        <Unreachable what="books" />
      ) : results.results.length === 0 ? (
        <Empty title={`No books found for “${q}”.`}>
          <p>{borrow ? 'Try different words.' : 'Try different words, or include borrow-only books.'}</p>
        </Empty>
      ) : (
        <>
          <StaleNotice stale={results.stale} />
          <h2 className="mb-6 font-serif text-xl text-ink">
            {q ? `${results.total.toLocaleString('en')} books` : 'Most-published classics'}
          </h2>
          <TileGrid>
            {results.results.map((w) => (
              <WorkTile key={w.workId} work={w} />
            ))}
          </TileGrid>
          <Pager path="/books" params={{ q, borrow: borrow ? '1' : undefined }} page={page} total={results.total} pageSize={results.pageSize} />
        </>
      )}
    </>
  );
}
