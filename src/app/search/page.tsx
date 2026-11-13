import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { FilterBar } from '@/components/FilterBar';
import { languageMenu, orderMenu, volumesMenu } from '@/components/filterMenus';
import { ResultTiles } from '@/components/ResultTiles';
import { SearchBox } from '@/components/SearchBox';
import { SpellingsMenu } from '@/components/SpellingsMenu';
import { LineSkeleton, SectionSkeleton } from '@/components/Skeletons';
import { Empty, PageHeading } from '@/components/States';
import { TileGrid, WorkTile } from '@/components/Tiles';
import { searchSection, searchTexts } from '@/lib/server/catalog/archive';
import { searchWorks } from '@/lib/server/catalog/openLibrary';
import { ARCHIVE_SECTIONS, SECTIONS } from '@/lib/server/catalog/sections';
import { attempt, str, type SearchParams } from '@/lib/server/pageParams';
import { recordSearch } from '@/lib/server/search/library';
import { hrefWith, parseSearch, SORTS, type RawParams, type SearchState } from '@/lib/server/search/params';
import { expandQuery, type ExpandedQuery } from '@/lib/server/search/variants';
import { languageFilterName } from '@/lib/shared/languages';
import type { ItemCard, Page, SectionId, WorkCard } from '@/lib/shared/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const q = str((await searchParams).q);
  return { title: q ? `“${q}”` : 'Search' };
}

const PREVIEW = 6;

/**
 * The search box and filters render immediately. Results stream in: each group appears as soon as its
 * own source answers, so one slow source never holds up the others.
 */
export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const state = parseSearch(sp);
  const { q, lang } = state;
  if (!q) {
    return (
      <>
        <PageHeading title="Search everything" lede="Books, newspapers, magazines, government documents and manuscripts." />
        <div className="max-w-3xl">
          <SearchBox action="/search" placeholder="Search titles, authors, publications" size="lg" autoFocus />
        </div>
      </>
    );
  }
  recordSearch('/search', sp);
  const view = (changes: Record<string, string | string[] | undefined>) => hrefWith('/search', sp, changes);
  // Started once here, shared by the chips and every group below.
  const expanded = expandQuery(q, state);

  return (
    <>
      <div className="mb-10 max-w-3xl space-y-4">
        <SearchBox
          action="/search"
          placeholder="Search everything"
          defaultValue={q}
          size="lg"
          hidden={{ ...(lang ? { lang } : {}), ...(state.sort ? { sort: state.sort } : {}) }}
        />
        <FilterBar
          menus={[
            languageMenu(lang, (code) => view({ lang: code })),
            orderMenu(state.sort, (sortKey) => view({ sort: sortKey })),
            volumesMenu(sp.sets === 'off', (off) => view({ sets: off ? 'off' : undefined })),
          ]}
        >
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
      <Groups sp={sp} state={state} expanded={expanded} />
    </>
  );
}

interface GroupMeta {
  id: string;
  title: string;
  /** How the group reads inside the summary sentence, after its count. */
  summary: string;
  href: string;
}

type GroupData = { kind: 'works'; page: Page<WorkCard> } | { kind: 'items'; section: SectionId; page: Page<ItemCard> };
type PendingGroup = { meta: GroupMeta; data: Promise<GroupData | null> };

function Groups({ sp, state, expanded }: { sp: RawParams; state: SearchState; expanded: Promise<ExpandedQuery> }) {
  const { lang } = state;
  const sort = state.sort ? [...SORTS[state.sort].archive] : undefined;
  const carry = (path: string, extra: Record<string, string> = {}) => hrefWith(path, sp, extra);

  // Every fetch starts now, in parallel; each group awaits only its own.
  const groups: PendingGroup[] = [
    {
      meta: { id: 'books', title: 'Books', summary: 'catalogued books', href: carry('/books') },
      data: expanded.then(async (e): Promise<GroupData | null> => {
        if (!e.ol) return null;
        const page = await attempt(() => searchWorks({ query: e.ol, pageSize: PREVIEW, language: lang }));
        return page ? { kind: 'works', page } : null;
      }),
    },
    {
      meta: { id: 'archive', title: 'More on archive.org', summary: 'scans on archive.org', href: carry('/books', { source: 'archive' }) },
      data: expanded.then(async (e): Promise<GroupData | null> => {
        const page = await attempt(() => searchTexts(e.lucene, 1, PREVIEW, lang, sort));
        return page ? { kind: 'items', section: 'books', page } : null;
      }),
    },
    ...ARCHIVE_SECTIONS.map(
      (section): PendingGroup => ({
        meta: {
          id: section,
          title: SECTIONS[section].name,
          summary: `in ${SECTIONS[section].name.toLowerCase()}`,
          href: carry(`/${section}`),
        },
        data: expanded.then(async (e): Promise<GroupData | null> => {
          const page = await attempt(() => searchSection(section, e.lucene, 1, lang, sort, PREVIEW));
          return page ? { kind: 'items', section, page } : null;
        }),
      }),
    ),
  ];

  return (
    <>
      <Suspense fallback={<LineSkeleton className="mb-8 w-2/3" />}>
        <Summary groups={groups} q={state.q!} lang={lang} />
      </Suspense>
      {groups.map((g) => (
        <Suspense key={g.meta.id} fallback={<SectionSkeleton title={g.meta.title} />}>
          <Group meta={g.meta} data={g.data} groupSets={sp.sets !== 'off'} />
        </Suspense>
      ))}
    </>
  );
}

async function Group({ meta, data, groupSets }: PendingGroup & { groupSets: boolean }) {
  const d = await data;
  if (!d || d.page.total === 0) return null;
  return (
    <section id={meta.id} className="t-section scroll-mt-8">
      <div className="mb-8 flex items-baseline justify-between gap-4">
        <h2 className="font-display text-2xl text-ink">{meta.title}</h2>
        {d.page.total > PREVIEW ? (
          <Link href={meta.href} className="shrink-0 text-sm text-ink-soft underline-offset-4 hover:text-accent hover:underline">
            See all {d.page.total.toLocaleString('en')}
          </Link>
        ) : null}
      </div>
      {d.kind === 'works' ? (
        <TileGrid>
          {d.page.results.slice(0, PREVIEW).map((w) => (
            <WorkTile key={w.workId} work={w} />
          ))}
        </TileGrid>
      ) : (
        <ResultTiles cards={d.page.results.slice(0, PREVIEW)} section={d.section} group={groupSets} />
      )}
    </section>
  );
}

/** "Found 3 catalogued books, 309 scans…": waits for every group, so it arrives last. */
async function Summary({ groups, q, lang }: { groups: PendingGroup[]; q: string; lang?: string }) {
  const settled = await Promise.all(groups.map(async (g) => ({ meta: g.meta, data: await g.data })));
  const found = settled.filter((g) => g.data && g.data.page.total > 0);
  if (found.length === 0) {
    return (
      <Empty title={`Nothing found for “${q}”.`}>
        <p>
          {lang
            ? `Nothing in ${languageFilterName(lang)}. Try “Any” language, or a different spelling.`
            : 'Try fewer words, a different spelling, or an author’s surname on its own.'}
        </p>
      </Empty>
    );
  }
  return (
    <p className="mb-8 text-ink-soft">
      {found.map((g, i) => (
        <span key={g.meta.id}>
          {i > 0 ? (i === found.length - 1 ? ' and ' : ', ') : 'Found '}
          <a href={`#${g.meta.id}`} className="text-ink underline-offset-4 hover:underline">
            {g.data!.page.total.toLocaleString('en')} {g.meta.summary}
          </a>
        </span>
      ))}
      .
    </p>
  );
}
