import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Pager } from '@/components/Pager';
import { SearchBox } from '@/components/SearchBox';
import { SelectAllButton } from '@/components/SelectToggle';
import { LanguagePicker } from '@/components/LanguagePicker';
import { SaveShelfButton } from '@/components/ShelfButtons';
import { SortPicker } from '@/components/SortPicker';
import { SpellingChips } from '@/components/SpellingChips';
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
      <PageHeading title={cfg.name} lede={cfg.tagline} />
      {state.q ? (
        <Results section={section} sp={sp} state={state} hidden={hidden} />
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
      <h2 className="mb-8 font-serif text-xl text-ink">
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

async function Results({
  section,
  sp,
  state,
  hidden,
}: {
  section: SectionId;
  sp: RawParams;
  state: SearchState;
  hidden: Record<string, string>;
}) {
  const cfg = SECTIONS[section];
  const q = state.q!;
  const path = `/${section}`;
  recordSearch(path, sp);
  const expanded = await expandQuery(q, state);
  const sort = state.sort ? [...SORTS[state.sort].archive] : undefined;
  const results = await attempt(() => searchSection(section, expanded.lucene, state.page, state.lang, sort));
  const view = (changes: Record<string, string | string[] | undefined>) => hrefWith(path, sp, changes);
  const langName = languageFilterName(state.lang);

  return (
    <>
      <div className="mb-6 max-w-2xl">
        <SearchBox action={path} placeholder={`Search ${cfg.name.toLowerCase()}`} defaultValue={q} hidden={hidden} />
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
      <div className="mb-10">
        <SortPicker current={state.sort} href={(s) => view({ sort: s })} />
      </div>

      {!results ? (
        <Unreachable what="results" />
      ) : results.results.length === 0 ? (
        <Empty title={`Nothing in ${cfg.name.toLowerCase()} for “${q}”.`}>
          <p>Try fewer words, another language, or search everything from the Search page.</p>
        </Empty>
      ) : (
        <>
          <StaleNotice stale={results.stale} />
          <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="font-serif text-xl text-ink">
              {results.total.toLocaleString('en')} results, {state.sort ? SORTS[state.sort].label.toLowerCase() : 'best match'} first
            </h2>
            <div className="flex flex-wrap items-center gap-6">
              <SaveShelfButton title={[q, cfg.name, langName].filter(Boolean).join(', ')} path={path} params={sp} />
              <SelectAllButton items={results.results.map((c) => itemToTray(c, section))} label="this page to the slip" />
            </div>
          </div>
          <TileGrid>
            {results.results.map((c) => (
              <ItemTile key={c.identifier} card={c} section={section} />
            ))}
          </TileGrid>
          <Pager path={path} params={sp} page={state.page} total={results.total} pageSize={results.pageSize} />
        </>
      )}
    </>
  );
}
