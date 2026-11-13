import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchBox } from '@/components/SearchBox';
import { Empty, PageHeading } from '@/components/States';
import { ItemTile, TileGrid, WorkTile } from '@/components/Tiles';
import { searchSection } from '@/lib/server/catalog/archive';
import { escapeLucene } from '@/lib/server/catalog/normalize';
import { olText, searchWorks } from '@/lib/server/catalog/openLibrary';
import { ARCHIVE_SECTIONS, SECTIONS } from '@/lib/server/catalog/sections';
import { attempt, str, type SearchParams } from '@/lib/server/pageParams';
import type { ItemCard, Page, SectionId, WorkCard } from '@/lib/shared/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const q = str((await searchParams).q);
  return { title: q ? `“${q}”` : 'Search' };
}

const PREVIEW = 6;

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const q = str((await searchParams).q);
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

  const text = olText(q);
  const lucene = escapeLucene(q);
  const [books, ...others] = await Promise.all([
    text ? attempt(() => searchWorks({ query: text, pageSize: PREVIEW })) : Promise.resolve(null),
    ...ARCHIVE_SECTIONS.map((s) => attempt(() => searchSection(s, lucene, 1).then((p) => ({ ...p, results: p.results.slice(0, PREVIEW) })))),
  ]);
  const groups: { section: SectionId; page: Page<ItemCard> | null }[] = ARCHIVE_SECTIONS.map((section, i) => ({
    section,
    page: others[i] ?? null,
  }));
  const anything = (books?.total ?? 0) + groups.reduce((n, g) => n + (g.page?.total ?? 0), 0);

  return (
    <>
      <div className="mb-12 max-w-3xl">
        <SearchBox action="/search" placeholder="Search everything" defaultValue={q} size="lg" />
        <SummaryLine books={books} groups={groups} />
      </div>

      {anything === 0 ? (
        <Empty title={`Nothing found for “${q}”.`}>
          <p>Try fewer words, a different spelling, or an author’s surname on its own.</p>
        </Empty>
      ) : null}

      {books && books.total > 0 ? (
        <ResultGroup section="books" total={books.total} q={q}>
          <TileGrid>
            {books.results.map((w: WorkCard) => (
              <WorkTile key={w.workId} work={w} />
            ))}
          </TileGrid>
        </ResultGroup>
      ) : null}

      {groups.map(({ section, page }) =>
        page && page.total > 0 ? (
          <ResultGroup key={section} section={section} total={page.total} q={q}>
            <TileGrid>
              {page.results.map((c) => (
                <ItemTile key={c.identifier} card={c} section={section} />
              ))}
            </TileGrid>
          </ResultGroup>
        ) : null,
      )}
    </>
  );
}

function SummaryLine({ books, groups }: { books: Page<WorkCard> | null; groups: { section: SectionId; page: Page<ItemCard> | null }[] }) {
  const parts = [
    { section: 'books' as SectionId, total: books?.total ?? 0 },
    ...groups.map((g) => ({ section: g.section, total: g.page?.total ?? 0 })),
  ].filter((p) => p.total > 0);
  if (parts.length === 0) return null;
  return (
    <p className="mt-4 text-ink-soft">
      {parts.map((p, i) => (
        <span key={p.section}>
          {i > 0 ? (i === parts.length - 1 ? ' and ' : ', ') : 'Found '}
          <a href={`#${p.section}`} className="text-ink underline-offset-4 hover:underline">
            {p.total.toLocaleString('en')} in {SECTIONS[p.section].name.toLowerCase()}
          </a>
        </span>
      ))}
      .
    </p>
  );
}

function ResultGroup({ section, total, q, children }: { section: SectionId; total: number; q: string; children: React.ReactNode }) {
  return (
    <section id={section} className="scroll-mt-8 border-t border-rule pt-10 pb-14">
      <div className="mb-8 flex items-baseline justify-between gap-4">
        <h2 className="font-serif text-2xl text-ink">{SECTIONS[section].name}</h2>
        {total > PREVIEW ? (
          <Link href={`/${section}?q=${encodeURIComponent(q)}`} className="text-sm text-ink-soft hover:text-accent">
            All {total.toLocaleString('en')} in {SECTIONS[section].name}
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
