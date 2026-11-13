import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Pager } from '@/components/Pager';
import { SearchBox } from '@/components/SearchBox';
import { SelectAllButton } from '@/components/SelectToggle';
import { Empty, PageHeading, StaleNotice, Unreachable } from '@/components/States';
import { ItemTile, itemToTray, TileGrid } from '@/components/Tiles';
import { listPublications, searchSection } from '@/lib/server/catalog/archive';
import { escapeLucene } from '@/lib/server/catalog/normalize';
import { ARCHIVE_SECTIONS, SECTIONS } from '@/lib/server/catalog/sections';
import { attempt, pageNum, str, type SearchParams } from '@/lib/server/pageParams';
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
  const q = str(sp.q);
  const page = pageNum(sp.page);

  return (
    <>
      <PageHeading title={cfg.name} lede={cfg.tagline} />
      <div className="mb-12 max-w-2xl">
        <SearchBox action={`/${section}`} placeholder={`Search ${cfg.name.toLowerCase()}`} defaultValue={q} />
      </div>
      {q ? <Results section={section} q={q} page={page} /> : <Publications section={section} page={page} />}
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

async function Results({ section, q, page }: { section: SectionId; q: string; page: number }) {
  const results = await attempt(() => searchSection(section, escapeLucene(q), page));
  if (!results) return <Unreachable what="results" />;
  if (results.results.length === 0) {
    return (
      <Empty title={`Nothing in ${SECTIONS[section].name.toLowerCase()} for “${q}”.`}>
        <p>Try fewer words, or search everything from the Search page.</p>
      </Empty>
    );
  }
  return (
    <>
      <StaleNotice stale={results.stale} />
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="font-serif text-xl text-ink">{results.total.toLocaleString('en')} results</h2>
        <SelectAllButton items={results.results.map((c) => itemToTray(c, section))} label="this page to the slip" />
      </div>
      <TileGrid>
        {results.results.map((c) => (
          <ItemTile key={c.identifier} card={c} section={section} />
        ))}
      </TileGrid>
      <Pager path={`/${section}`} params={{ q }} page={page} total={results.total} pageSize={results.pageSize} />
    </>
  );
}
