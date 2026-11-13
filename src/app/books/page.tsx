import type { Metadata } from 'next';
import Link from 'next/link';
import { LanguagePicker } from '@/components/LanguagePicker';
import { Pager } from '@/components/Pager';
import { SearchBox } from '@/components/SearchBox';
import { Segmented } from '@/components/Segmented';
import { SelectAllButton } from '@/components/SelectToggle';
import { SaveShelfButton } from '@/components/ShelfButtons';
import { SortPicker } from '@/components/SortPicker';
import { SpellingChips } from '@/components/SpellingChips';
import { Empty, PageHeading, StaleNotice, Unreachable } from '@/components/States';
import { ItemTile, itemToTray, TileGrid, WorkTile } from '@/components/Tiles';
import { searchTexts } from '@/lib/server/catalog/archive';
import { searchWorks } from '@/lib/server/catalog/openLibrary';
import { SECTIONS } from '@/lib/server/catalog/sections';
import { attempt, pageNum, type SearchParams } from '@/lib/server/pageParams';
import { recordSearch } from '@/lib/server/search/library';
import { hrefWith, parseSearch, SORTS, type RawParams, type SearchState } from '@/lib/server/search/params';
import { expandQuery } from '@/lib/server/search/variants';
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

export default async function BooksPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const state = parseSearch(sp);
  const source: Source = sp.source === 'archive' ? 'archive' : 'catalogue';
  const borrow = source === 'catalogue' && sp.borrow === '1';

  // A new search keeps the view (source, language, order, borrow) but not removed spellings.
  const hidden: Record<string, string> = {};
  if (source === 'archive') hidden.source = 'archive';
  if (borrow) hidden.borrow = '1';
  if (state.lang) hidden.lang = state.lang;
  if (state.sort) hidden.sort = state.sort;

  return (
    <>
      <PageHeading title={SECTIONS.books.name} lede={SECTIONS.books.tagline} />
      {state.q ? (
        <SearchResults sp={sp} state={state} source={source} borrow={borrow} hidden={hidden} />
      ) : (
        <>
          <div className="mb-6 max-w-2xl">
            <SearchBox action="/books" placeholder="Title, author or subject, in any script" hidden={hidden} />
          </div>
          <Browse page={pageNum(sp.page)} />
        </>
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
 * Two sources behind one search box. Open Library has clean, grouped records for the books it has
 * catalogued; archive.org has every scan, including many Indic texts Open Library has never heard of.
 * Both counts are always shown, so the other source is never invisible.
 */
async function SearchResults({
  sp,
  state,
  source,
  borrow,
  hidden,
}: {
  sp: RawParams;
  state: SearchState;
  source: Source;
  borrow: boolean;
  hidden: Record<string, string>;
}) {
  const q = state.q!;
  recordSearch('/books', sp);
  const expanded = await expandQuery(q, state);
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

  const count = (n: number | undefined) => (n === undefined ? '' : ` (${n.toLocaleString('en')})`);
  const view = (changes: Record<string, string | string[] | undefined>) => hrefWith('/books', sp, changes);
  const langName = languageFilterName(state.lang);
  const shelfTitle = langName ? `${q}, ${langName}` : q;

  return (
    <>
      <div className="mb-6 max-w-2xl">
        <SearchBox action="/books" placeholder="Title, author or subject, in any script" defaultValue={q} hidden={hidden} />
        <SpellingChips
          added={expanded.added}
          excluded={state.excluded}
          exact={state.exact}
          removeHref={(v) => view({ x: [...state.excluded, v] })}
          resetHref={view({ x: undefined })}
          exactHref={(on) => view({ exact: on ? '1' : undefined, x: undefined })}
        />
      </div>
      <div className="mb-5">
        <LanguagePicker current={state.lang} href={(code) => view({ lang: code })} />
      </div>
      <div className="mb-10 flex flex-wrap items-center gap-3">
        <Segmented
          label="Where to search"
          options={[
            { label: `Catalogued books${count(catalogue?.total)}`, href: view({ source: undefined, sort: undefined }), current: source === 'catalogue' },
            { label: `All scans on archive.org${count(archive?.total)}`, href: view({ source: 'archive', borrow: undefined }), current: source === 'archive' },
          ]}
        />
        {source === 'catalogue' ? (
          <Segmented
            label="Which books"
            options={[
              { label: 'Free to read', href: view({ borrow: undefined }), current: !borrow },
              { label: 'Include borrow-only', href: view({ borrow: '1' }), current: borrow },
            ]}
          />
        ) : (
          <SortPicker current={state.sort} href={(s) => view({ sort: s })} />
        )}
      </div>

      {source === 'catalogue' ? (
        !catalogue ? (
          <Unreachable what="books" />
        ) : catalogue.results.length === 0 ? (
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
        ) : (
          <>
            <StaleNotice stale={catalogue.stale} />
            <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
              <h2 className="font-serif text-xl text-ink">{catalogue.total.toLocaleString('en')} books</h2>
              <SaveShelfButton title={shelfTitle} path="/books" params={sp} />
            </div>
            <TileGrid>
              {catalogue.results.map((w) => (
                <WorkTile key={w.workId} work={w} />
              ))}
            </TileGrid>
            <Pager path="/books" params={sp} page={page} total={catalogue.total} pageSize={catalogue.pageSize} />
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
            <h2 className="font-serif text-xl text-ink">
              {archive.total.toLocaleString('en')} scans, {state.sort ? SORTS[state.sort].label.toLowerCase() : 'best match'} first
            </h2>
            <div className="flex flex-wrap items-center gap-6">
              <SaveShelfButton title={shelfTitle} path="/books" params={sp} />
              <SelectAllButton items={archive.results.map((c) => itemToTray(c, 'books'))} label="this page to the slip" />
            </div>
          </div>
          <TileGrid>
            {archive.results.map((c) => (
              <ItemTile key={c.identifier} card={c} section="books" />
            ))}
          </TileGrid>
          <Pager path="/books" params={sp} page={page} total={archive.total} pageSize={archive.pageSize} />
        </>
      )}
    </>
  );
}
