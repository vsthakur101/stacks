import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { FilterBar } from '@/components/FilterBar';
import { languageMenu, orderMenu, volumesMenu } from '@/components/filterMenus';
import { ResultTiles, SET_SECTIONS } from '@/components/ResultTiles';
import { Pager } from '@/components/Pager';
import { ResultsHeader } from '@/components/ResultsHeader';
import { SpellingsMenu } from '@/components/SpellingsMenu';
import { SearchBox } from '@/components/SearchBox';
import { TilesSkeleton } from '@/components/Skeletons';
import { SelectAllButton } from '@/components/SelectToggle';
import { SaveShelfButton } from '@/components/ShelfButtons';
import { Empty, PageHeading, StaleNotice, Unreachable } from '@/components/States';
import { ItemTile, itemToTray, TileGrid } from '@/components/Tiles';
import { listPublications, searchSection } from '@/lib/server/catalog/archive';
import { ARCHIVE_SECTIONS, SECTIONS } from '@/lib/server/catalog/sections';
import { attempt, pageNum, type SearchParams } from '@/lib/server/pageParams';
import { recordSearch } from '@/lib/server/search/library';
import { hrefWith, parseSearch, SORTS, type RawParams, type SearchState } from '@/lib/server/search/params';
import { expandQuery } from '@/lib/server/search/variants';
import { languageFilterName } from '@/lib/shared/languages';
import type { SectionId } from '@/lib/shared/types';

export const dynamic = 'force-dynamic';
type Params = Promise<{ section: string }>;

function asSection(raw: string): SectionId {
  if (!(ARCHIVE_SECTIONS as readonly string[]).includes(raw)) notFound();
  return raw as SectionId;
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { section } = await params;
  return { title: (ARCHIVE_SECTIONS as readonly string[]).includes(section) ? SECTIONS[section as SectionId].name : 'Not found' };
}

export default async function SectionPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const section = asSection((await params).section);
  const cfg = SECTIONS[section];
  const sp = await searchParams;
  const state = parseSearch(sp);
  const hidden: Record<string, string> = {};
  if (state.lang) hidden.lang = state.lang;
  if (state.sort) hidden.sort = state.sort;

  return (
    <>
      <PageHeading title={cfg.name} lede={state.q ? undefined : cfg.tagline} />
      {state.q ? (
        <>
          <div className="mb-8 max-w-3xl space-y-4">
            <SearchBox action={`/${section}`} placeholder={`Search ${cfg.name.toLowerCase()}`} defaultValue={state.q} hidden={hidden} />
            <FilterBar
              menus={[
                languageMenu(state.lang, (code) => hrefWith(`/${section}`, sp, { lang: code })),
                orderMenu(state.sort, (s) => hrefWith(`/${section}`, sp, { sort: s })),
                ...(SET_SECTIONS.includes(section)
                  ? [volumesMenu(sp.sets === 'off', (off) => hrefWith(`/${section}`, sp, { sets: off ? 'off' : undefined }))]
                  : []),
              ]}
            >
              <Suspense fallback={null}>
                <SpellingsMenu
                  expanded={expandQuery(state.q, state)}
                  excluded={state.excluded}
                  exact={state.exact}
                  removeHref={(v) => hrefWith(`/${section}`, sp, { x: [...state.excluded, v] })}
                  resetHref={hrefWith(`/${section}`, sp, { x: undefined })}
                  exactHref={(on) => hrefWith(`/${section}`, sp, { exact: on ? '1' : undefined, x: undefined })}
                />
              </Suspense>
            </FilterBar>
          </div>
          <Suspense key={JSON.stringify(sp)} fallback={<TilesSkeleton count={12} shape="page" />}>
            <Results section={section} sp={sp} state={state} />
          </Suspense>
        </>
      ) : (
        <>
          <div className="mb-12 max-w-2xl">
            <SearchBox action={`/${section}`} placeholder={`Search ${cfg.name.toLowerCase()}`} />
          </div>
          <Publications section={section} page={pageNum(sp.page)} />
        </>
      )}
    </>
  );
}

async function Publications({ section, page }: { section: SectionId; page: number }) {
  const cfg = SECTIONS[section];
  const pubs = await attempt(() => listPublications(section, page));
  if (!pubs) return <Unreachable what={cfg.name.toLowerCase()} />;
  if (pubs.results.length === 0) return <Empty title={`No ${cfg.unit.plural} here yet.`} />;
  return (
    <>
      <StaleNotice stale={pubs.stale} />
      <h2 className="mb-8 font-title text-xl text-ink">
        {pubs.total.toLocaleString('en')} {pubs.total === 1 ? cfg.unit.singular : cfg.unit.plural}, most read first
      </h2>
      <TileGrid>
        {pubs.results.map((c) => (
          <ItemTile key={c.identifier} card={c} section={section} />
        ))}
      </TileGrid>
      <Pager path={`/${section}`} params={{}} page={page} total={pubs.total} pageSize={pubs.pageSize} />
    </>
  );
}

async function Results({ section, sp, state }: { section: SectionId; sp: RawParams; state: SearchState }) {
  const cfg = SECTIONS[section];
  const q = state.q!;
  const path = `/${section}`;
  recordSearch(path, sp);
  const expanded = await expandQuery(q, state);
  const sort = state.sort ? [...SORTS[state.sort].archive] : undefined;
  const results = await attempt(() => searchSection(section, expanded.lucene, state.page, state.lang, sort));
  const langName = languageFilterName(state.lang);

  return (
    <>
      {!results ? (
        <Unreachable what="results" />
      ) : results.results.length === 0 ? (
        <Empty title={`Nothing in ${cfg.name.toLowerCase()} for “${q}”.`}>
          <p>Try fewer words, another language, or search everything from the Search page.</p>
        </Empty>
      ) : (
        <>
          <StaleNotice stale={results.stale} />
          <ResultsHeader
            title={`${results.total.toLocaleString('en')} results`}
            actions={
              <>
                <SaveShelfButton title={[q, cfg.name, langName].filter(Boolean).join(', ')} path={path} params={sp} />
                <SelectAllButton items={results.results.map((c) => itemToTray(c, section))} label="this page to your selection" />
              </>
            }
          />
          <ResultTiles cards={results.results} section={section} group={sp.sets !== 'off'} />
          <Pager path={path} params={sp} page={state.page} total={results.total} pageSize={results.pageSize} />
        </>
      )}
    </>
  );
}
