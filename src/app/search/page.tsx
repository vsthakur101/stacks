import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchBox } from '@/components/SearchBox';
import { LanguagePicker } from '@/components/LanguagePicker';
import { Empty, PageHeading } from '@/components/States';
import { ItemTile, TileGrid, WorkTile } from '@/components/Tiles';
import { searchSection, searchTexts } from '@/lib/server/catalog/archive';
import { escapeLucene } from '@/lib/server/catalog/normalize';
import { olText, searchWorks } from '@/lib/server/catalog/openLibrary';
import { ARCHIVE_SECTIONS, SECTIONS } from '@/lib/server/catalog/sections';
import { attempt, str, type SearchParams } from '@/lib/server/pageParams';
import { findLanguage } from '@/lib/shared/languages';
import type { Page, WorkCard } from '@/lib/shared/types';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const q = str((await searchParams).q);
  return { title: q ? `“${q}”` : 'Search' };
}

const PREVIEW = 6;

export default async function SearchPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = str(sp.q);
  const lang = findLanguage(str(sp.lang))?.code;
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
  const preview = <T,>(p: Page<T>): Page<T> => ({ ...p, results: p.results.slice(0, PREVIEW) });
  const [books, texts, ...others] = await Promise.all([
    text ? attempt(() => searchWorks({ query: text, pageSize: PREVIEW, language: lang })) : Promise.resolve(null),
    attempt(() => searchTexts(lucene, 1, PREVIEW, lang)),
    ...ARCHIVE_SECTIONS.map((s) => attempt(() => searchSection(s, lucene, 1, lang).then(preview))),
  ]);

  // Order: catalogued books, then every other scan on archive.org, then the archive sections.
  const groups: Group[] = [];
  if (books && books.total > 0) {
    groups.push({
      id: 'books',
      title: 'Books',
      summary: 'catalogued books',
      total: books.total,
      href: withLang(`/books?q=${encodeURIComponent(q)}`, lang),
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
      href: withLang(`/books?q=${encodeURIComponent(q)}&source=archive`, lang),
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
      href: withLang(`/${section}?q=${encodeURIComponent(q)}`, lang),
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
        <SearchBox action="/search" placeholder="Search everything" defaultValue={q} size="lg" hidden={lang ? { lang } : undefined} />
        <div className="mt-6">
          <LanguagePicker current={lang} href={(code) => withLang(`/search?q=${encodeURIComponent(q)}`, code)} />
        </div>
        <SummaryLine groups={groups} />
      </div>

      {groups.length === 0 ? (
        <Empty title={`Nothing found for “${q}”.`}>
          <p>
            {lang
              ? `Nothing in ${findLanguage(lang)?.name}. Try “Any” language, or a different spelling.`
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

function withLang(path: string, lang: string | undefined): string {
  return lang ? `${path}&lang=${lang}` : path;
}
