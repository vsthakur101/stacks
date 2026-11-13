import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { FilterBar, type FilterMenuSpec } from '@/components/FilterBar';
import { languageMenu, orderMenu } from '@/components/filterMenus';
import { Pager } from '@/components/Pager';
import { ResultsHeader } from '@/components/ResultsHeader';
import { SearchBox } from '@/components/SearchBox';
import { SelectAllButton } from '@/components/SelectToggle';
import { SaveShelfButton } from '@/components/ShelfButtons';
import { TilesSkeleton } from '@/components/Skeletons';
import { SpellingsMenu } from '@/components/SpellingsMenu';
import { Empty, PageHeading, StaleNotice, Unreachable } from '@/components/States';
import { ItemTile, itemToTray, TileGrid, WorkTile } from '@/components/Tiles';
import { searchTexts } from '@/lib/server/catalog/archive';
import { searchWorks } from '@/lib/server/catalog/openLibrary';
import { SECTIONS } from '@/lib/server/catalog/sections';
import { attempt, pageNum, type SearchParams } from '@/lib/server/pageParams';
import { recordSearch } from '@/lib/server/search/library';
import { hrefWith, parseSearch, SORTS, type RawParams, type SearchState } from '@/lib/server/search/params';
import { expandQuery, type ExpandedQuery } from '@/lib/server/search/variants';
import { languageFilterName } from '@/lib/shared/languages';

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
const PLACEHOLDER = 'Title, author or subject, in any script';

export default async function BooksPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const state = parseSearch(sp);
  const source: Source = sp.source === 'archive' ? 'archive' : 'catalogue';
  const borrow = source === 'catalogue' && sp.borrow === '1';

  if (!state.q) {
    return (
      <>
        <PageHeading title={SECTIONS.books.name} lede={SECTIONS.books.tagline} />
        <div className="mb-8 max-w-2xl">
          <SearchBox action="/books" placeholder={PLACEHOLDER} />
        </div>
        <Browse page={pageNum(sp.page)} />
      </>
    );
  }

  // A new search keeps the view (source, language, order, borrow) but not removed spellings.
  const hidden: Record<string, string> = {};
  if (source === 'archive') hidden.source = 'archive';
  if (borrow) hidden.borrow = '1';
  if (state.lang) hidden.lang = state.lang;
  if (state.sort) hidden.sort = state.sort;
  const view = (changes: Record<string, string | string[] | undefined>) => hrefWith('/books', sp, changes);
  const expanded = expandQuery(state.q, state);

  // Source, then the filter that applies to it: free/borrow for catalogued books, order for scans.
  const menus: FilterMenuSpec[] = [
    {
      label: 'Source',
      value: source === 'archive' ? 'All scans' : 'Catalogued',
      active: source === 'archive',
      options: [
        { key: 'catalogue', label: 'Catalogued books', hint: 'Open Library: one clean record per book', href: view({ source: undefined, sort: undefined }), current: source === 'catalogue' },
        { key: 'archive', label: 'All scans on archive.org', hint: 'Every scan, including texts Open Library lacks', href: view({ source: 'archive', borrow: undefined }), current: source === 'archive' },
      ],
    },
    languageMenu(state.lang, (code) => view({ lang: code })),
    source === 'catalogue'
      ? {
          label: 'Books',
          value: borrow ? 'Include borrow-only' : 'Free to read',
          active: borrow,
          options: [
            { key: 'free', label: 'Free to read', href: view({ borrow: undefined }), current: !borrow },
            { key: 'borrow', label: 'Include borrow-only', hint: 'Shown with a link to borrow on archive.org', href: view({ borrow: '1' }), current: borrow },
          ],
        }
      : orderMenu(state.sort, (s) => view({ sort: s })),
  ];

  return (
    <>
      <PageHeading title={SECTIONS.books.name} />
      <div className="mb-8 max-w-3xl space-y-4">
        <SearchBox action="/books" placeholder={PLACEHOLDER} defaultValue={state.q} hidden={hidden} />
        <FilterBar menus={menus}>
          <Suspense fallback={null}>
            <SpellingsMenu
              expanded={expanded}
              excluded={state.excluded}
              exact={state.exact}
              removeHref={(v) => view({ x: [...state.excluded, v] })}
              resetHref={view({ x: undefined })}
              exactHref={(on) => view({ exact: on ? '1' : undefined, x: undefined })}
            />
          </Suspense>
        </FilterBar>
      </div>
      <Suspense key={JSON.stringify(sp)} fallback={<TilesSkeleton count={12} />}>
        <SearchResults sp={sp} state={state} source={source} borrow={borrow} expanded={expanded} />
      </Suspense>
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
          <Link key={slug} href={`/subjects/${slug}`} className="py-1 underline-offset-4 hover:text-accent hover:underline">
            {name}
          </Link>
        ))}
      </div>
      {!results ? (
        <Unreachable what="books" />
      ) : (
        <>
          <StaleNotice stale={results.stale} />
          <h2 className="font-display mb-6 text-2xl text-ink">Most-published classics</h2>
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
 * Two sources behind one search box. Open Library has clean, grouped records for the books it has
 * catalogued; archive.org has every scan, including many Indic texts Open Library has never heard of.
 * The results line always names the other source's count, so it's never invisible.
 */
async function SearchResults({
  sp,
  state,
  source,
  borrow,
  expanded: expandedPromise,
}: {
  sp: RawParams;
  state: SearchState;
  source: Source;
  borrow: boolean;
  expanded: Promise<ExpandedQuery>;
}) {
  const q = state.q!;
  recordSearch('/books', sp);
  const expanded = await expandedPromise;
  const sort = state.sort ? [...SORTS[state.sort].archive] : undefined;
  const page = state.page;
  const [catalogue, archive] = await Promise.all([
    expanded.ol
      ? attempt(() =>
          searchWorks({
            query: expanded.ol,
            page: source === 'catalogue' ? page : 1,
            pageSize: source === 'catalogue' ? 24 : 1,
            includeBorrowable: borrow,
            language: state.lang,
          }),
        )
      : Promise.resolve(null),
    attempt(() => searchTexts(expanded.lucene, source === 'archive' ? page : 1, source === 'archive' ? 24 : 0, state.lang, sort)),
  ]);

  const view = (changes: Record<string, string | string[] | undefined>) => hrefWith('/books', sp, changes);
  const langName = languageFilterName(state.lang);
  const shelfTitle = langName ? `${q}, ${langName}` : q;
  const other = (n: number | undefined, label: string, href: string) =>
    n ? (
      <Link href={href} className="text-ink-soft underline-offset-4 hover:text-accent hover:underline">
        {n.toLocaleString('en')} {label}
      </Link>
    ) : null;

  if (source === 'catalogue') {
    if (!catalogue) return <Unreachable what="books" />;
    if (catalogue.results.length === 0) {
      return (
        <Empty title={`No catalogued books for “${q}”.`}>
          {archive && archive.total > 0 ? (
            <p>
              archive.org has {archive.total.toLocaleString('en')} scans that match.{' '}
              <Link href={view({ source: 'archive', borrow: undefined })} className="text-accent underline underline-offset-4">
                Show them
              </Link>
              .
            </p>
          ) : (
            <p>{borrow ? 'Try different words.' : 'Try different words, or include borrow-only books.'}</p>
          )}
        </Empty>
      );
    }
    return (
      <>
        <StaleNotice stale={catalogue.stale} />
        <ResultsHeader
          title={`${catalogue.total.toLocaleString('en')} books`}
          other={other(archive?.total, 'scans on archive.org', view({ source: 'archive', borrow: undefined }))}
          actions={<SaveShelfButton title={shelfTitle} path="/books" params={sp} />}
        />
        <TileGrid>
          {catalogue.results.map((w) => (
            <WorkTile key={w.workId} work={w} />
          ))}
        </TileGrid>
        <Pager path="/books" params={sp} page={page} total={catalogue.total} pageSize={catalogue.pageSize} />
      </>
    );
  }

  if (!archive) return <Unreachable what="archive.org results" />;
  if (archive.results.length === 0) {
    return (
      <Empty title={`Nothing on archive.org for “${q}”.`}>
        <p>Try fewer words, or a different spelling. Titles are often transliterated several ways.</p>
      </Empty>
    );
  }
  return (
    <>
      <StaleNotice stale={archive.stale} />
      <ResultsHeader
        title={`${archive.total.toLocaleString('en')} scans`}
        other={other(catalogue?.total, 'catalogued books', view({ source: undefined, sort: undefined }))}
        actions={
          <>
            <SaveShelfButton title={shelfTitle} path="/books" params={sp} />
            <SelectAllButton items={archive.results.map((c) => itemToTray(c, 'books'))} label="this page to your selection" />
          </>
        }
      />
      <TileGrid>
        {archive.results.map((c) => (
          <ItemTile key={c.identifier} card={c} section="books" />
        ))}
      </TileGrid>
      <Pager path="/books" params={sp} page={page} total={archive.total} pageSize={archive.pageSize} />
    </>
  );
}
