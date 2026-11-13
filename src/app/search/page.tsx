import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchBox } from '@/components/SearchBox';
import { LanguagePicker } from '@/components/LanguagePicker';
import { SortPicker } from '@/components/SortPicker';
import { SpellingChips } from '@/components/SpellingChips';
import { Empty, PageHeading } from '@/components/States';
import { ItemTile, TileGrid, WorkTile } from '@/components/Tiles';
import { searchSection, searchTexts } from '@/lib/server/catalog/archive';
import { searchWorks } from '@/lib/server/catalog/openLibrary';
import { ARCHIVE_SECTIONS, SECTIONS } from '@/lib/server/catalog/sections';
import { attempt, str, type SearchParams } from '@/lib/server/pageParams';
import { recordSearch } from '@/lib/server/search/library';
import { hrefWith, parseSearch, SORTS } from '@/lib/server/search/params';
import { expandQuery } from '@/lib/server/search/variants';
import { languageFilterName } from '@/lib/shared/languages';
import type { WorkCard } from '@/lib/shared/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const q = str((await searchParams).q);
  return { title: q ? `“${q}”` : 'Search' };
}

const PREVIEW = 6;

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
  const expanded = await expandQuery(q, state);
  const sort = state.sort ? [...SORTS[state.sort].archive] : undefined;
  const view = (changes: Record<string, string | string[] | undefined>) => hrefWith('/search', sp, changes);
  // Links into a section carry the language, order and spelling choices made here.
  const carry = (path: string, extra: Record<string, string> = {}) => hrefWith(path, sp, extra);
  const [books, texts, ...others] = await Promise.all([
    expanded.ol ? attempt(() => searchWorks({ query: expanded.ol, pageSize: PREVIEW, language: lang })) : Promise.resolve(null),
    attempt(() => searchTexts(expanded.lucene, 1, PREVIEW, lang, sort)),
    ...ARCHIVE_SECTIONS.map((s) => attempt(() => searchSection(s, expanded.lucene, 1, lang, sort, PREVIEW))),
  ]);

  // Order: catalogued books, then every other scan on archive.org, then the archive sections.
  const groups: Group[] = [];
  if (books && books.total > 0) {
    groups.push({
      id: 'books',
      title: 'Books',
      summary: 'catalogued books',
      total: books.total,
      href: carry('/books'),
      body: (
        <TileGrid>
          {books.results.map((w: WorkCard) => (
            <WorkTile key={w.workId} work={w} />
          ))}
        </TileGrid>
      ),
    });
  }
  if (texts && texts.total > 0) {
    groups.push({
      id: 'archive',
      title: 'More on archive.org',
      summary: 'scans on archive.org',
      total: texts.total,
      href: carry('/books', { source: 'archive' }),
      body: (
        <TileGrid>
          {texts.results.map((c) => (
            <ItemTile key={c.identifier} card={c} section="books" />
          ))}
        </TileGrid>
      ),
    });
  }
  ARCHIVE_SECTIONS.forEach((section, i) => {
    const page = others[i];
    if (!page || page.total === 0) return;
    groups.push({
      id: section,
      title: SECTIONS[section].name,
      summary: `in ${SECTIONS[section].name.toLowerCase()}`,
      total: page.total,
      href: carry(`/${section}`),
      body: (
        <TileGrid>
          {page.results.map((c) => (
            <ItemTile key={c.identifier} card={c} section={section} />
          ))}
        </TileGrid>
      ),
    });
  });

  return (
    <>
      <div className="mb-12 max-w-3xl">
        <SearchBox
          action="/search"
          placeholder="Search everything"
          defaultValue={q}
          size="lg"
          hidden={{ ...(lang ? { lang } : {}), ...(state.sort ? { sort: state.sort } : {}) }}
        />
        <SpellingChips
          added={expanded.added}
          excluded={state.excluded}
          exact={state.exact}
          removeHref={(v) => view({ x: [...state.excluded, v] })}
          resetHref={view({ x: undefined })}
          exactHref={(on) => view({ exact: on ? '1' : undefined, x: undefined })}
        />
        <div className="mt-6 space-y-3">
          <LanguagePicker current={lang} href={(code) => view({ lang: code })} />
          <SortPicker current={state.sort} href={(sortKey) => view({ sort: sortKey })} />
        </div>
        <SummaryLine groups={groups} />
      </div>

      {groups.length === 0 ? (
        <Empty title={`Nothing found for “${q}”.`}>
          <p>
            {lang
              ? `Nothing in ${languageFilterName(lang)}. Try “Any” language, or a different spelling.`
              : 'Try fewer words, a different spelling, or an author’s surname on its own.'}
          </p>
        </Empty>
      ) : null}

      {groups.map((g) => (
        <section key={g.id} id={g.id} className="scroll-mt-8 border-t border-rule pt-10 pb-14">
          <div className="mb-8 flex items-baseline justify-between gap-4">
            <h2 className="font-serif text-2xl text-ink">{g.title}</h2>
            {g.total > PREVIEW ? (
              <Link href={g.href} className="shrink-0 text-sm text-ink-soft underline-offset-4 hover:text-accent hover:underline">
                See all {g.total.toLocaleString('en')}
              </Link>
            ) : null}
          </div>
          {g.body}
        </section>
      ))}
    </>
  );
}

interface Group {
  id: string;
  title: string;
  /** How the group reads inside the summary sentence, after its count. */
  summary: string;
  total: number;
  href: string;
  body: React.ReactNode;
}

function SummaryLine({ groups }: { groups: Group[] }) {
  if (groups.length === 0) return null;
  return (
    <p className="mt-4 text-ink-soft">
      {groups.map((g, i) => (
        <span key={g.id}>
          {i > 0 ? (i === groups.length - 1 ? ' and ' : ', ') : 'Found '}
          <a href={`#${g.id}`} className="text-ink underline-offset-4 hover:underline">
            {g.total.toLocaleString('en')} {g.summary}
          </a>
        </span>
      ))}
      .
    </p>
  );
}

