import { ExternalLink } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Cover } from '@/components/Cover';
import { FilterBar, type FilterMenuSpec } from '@/components/FilterBar';
import { languageMenu } from '@/components/filterMenus';
import { Pager } from '@/components/Pager';
import { SearchBox } from '@/components/SearchBox';
import { SelectToggle } from '@/components/SelectToggle';
import { LineSkeleton } from '@/components/Skeletons';
import { Empty, PageHeading } from '@/components/States';
import { itemHref } from '@/components/Tiles';
import { FULLTEXT_PAGE_SIZE, searchFullText, type FullTextHit, type FullTextPage } from '@/lib/server/catalog/fullText';
import { archiveThumb } from '@/lib/server/catalog/normalize';
import { scanLibrary } from '@/lib/server/library/scan';
import { attempt, pageNum, str, type SearchParams } from '@/lib/server/pageParams';
import { hrefWith } from '@/lib/server/search/params';
import { getSettings } from '@/lib/server/settings';
import { languageFilterName } from '@/lib/shared/languages';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const q = str((await searchParams).q);
  return { title: q ? `Inside books: “${q}”` : 'Search inside books' };
}

/**
 * Search inside books: the recognised text of archive.org's scans. archive.org answers in 2–12 s, so
 * the box and filters render at once and results stream in behind a clear "searching" state.
 */
export default async function InsidePage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const q = str(sp.q);
  const lang = str(sp.lang);
  const phrase = sp.phrase === '1';
  const page = pageNum(sp.page, 50);
  const view = (changes: Record<string, string | undefined>) => hrefWith('/inside', sp, { ...changes, page: undefined });

  if (!q) {
    return (
      <>
        <PageHeading title="Search inside books" lede="Find the books that contain a word, a name or a line of a verse, in the text of archive.org’s scans." />
        <div className="max-w-3xl">
          <SearchBox action="/inside" placeholder="धर्मक्षेत्रे कुरुक्षेत्रे, Hanuman Chalisa, a line you remember…" size="lg" autoFocus />
          <p className="mt-4 text-sm text-ink-soft">
            Roman letters search Devanagari too. Looking for a title or an author?{' '}
            <Link href="/search" className="text-accent underline-offset-4 hover:underline">
              Search titles instead
            </Link>
            .
          </p>
        </div>
      </>
    );
  }

  const phraseMenu: FilterMenuSpec = {
    label: 'Words',
    value: phrase ? 'Exact phrase' : 'All words',
    active: phrase,
    options: [
      { key: 'all', label: 'All words', hint: 'Anywhere in the book', href: view({ phrase: undefined }), current: !phrase },
      { key: 'phrase', label: 'Exact phrase', hint: 'Together, in this order: a verse line', href: view({ phrase: '1' }), current: phrase },
    ],
  };

  return (
    <>
      <div className="mb-10 max-w-3xl space-y-4">
        <SearchBox
          action="/inside"
          placeholder="Search inside books"
          defaultValue={q}
          size="lg"
          hidden={{ ...(lang ? { lang } : {}), ...(phrase ? { phrase: '1' } : {}) }}
        />
        <FilterBar menus={[languageMenu(lang, (code) => view({ lang: code })), phraseMenu]} />
        <p className="text-sm text-ink-soft">
          Searching the text inside books.{' '}
          <Link href={hrefWith('/search', { q, ...(lang ? { lang } : {}) }, {})} className="text-accent underline-offset-4 hover:underline">
            Search titles for “{q}” instead
          </Link>
        </p>
      </div>
      <Suspense key={`${q}|${lang}|${phrase}|${page}`} fallback={<Searching />}>
        <Results q={q} lang={lang} phrase={phrase} page={page} sp={sp} />
      </Suspense>
    </>
  );
}

function Searching() {
  return (
    <div role="status" aria-live="polite">
      <p className="mb-8 text-ink-soft">Reading through archive.org’s scanned text. This usually takes 5–15 seconds.</p>
      <div className="space-y-10">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="flex gap-5">
            <div className="t-cover aspect-[2/3] w-20 shrink-0 animate-pulse bg-raised" />
            <div className="flex-1 space-y-3">
              <LineSkeleton className="w-1/2" />
              <LineSkeleton className="w-1/3" />
              <LineSkeleton className="w-5/6" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

async function Results({ q, lang, phrase, page, sp }: { q: string; lang?: string; phrase: boolean; page: number; sp: Record<string, string | string[] | undefined> }) {
  const [result, scan] = await Promise.all([attempt(() => searchFullText({ q, lang, phrase, page })), scanLibrary(getSettings().downloadRoot).catch(() => null)]);
  if (!result) {
    return (
      <Empty title="archive.org’s text search didn’t answer.">
        <p>It’s slow and sometimes busy. Wait a moment and reload the page.</p>
      </Empty>
    );
  }
  if (result.total === 0) {
    return (
      <Empty title={`No book’s text contains “${q}”.`}>
        <p>
          {lang ? `Nothing in ${languageFilterName(lang)}; try “Any” language. ` : ''}
          {phrase ? 'Try “All words” instead of the exact phrase, or ' : 'Try '}fewer words: old scans’ recognised text has errors, so a long line rarely matches word for word.
        </p>
      </Empty>
    );
  }

  // Downloaded books open in our own reader with Find already searching.
  const local = new Map<string, string>();
  for (const item of scan?.items ?? []) {
    const file = item.files.find((f) => f.ext === 'pdf') ?? item.files.find((f) => f.ext === 'txt');
    if (file) local.set(item.identifier, file.relative);
  }

  return (
    <>
      <Summary result={result} q={q} />
      <ol className="divide-y divide-rule">
        {result.hits.map((hit) => (
          <HitRow key={hit.identifier} hit={hit} q={q} localFile={local.get(hit.identifier)} />
        ))}
      </ol>
      <Pager path="/inside" params={sp} page={page} total={Math.min(result.total, 50 * FULLTEXT_PAGE_SIZE)} pageSize={FULLTEXT_PAGE_SIZE} />
    </>
  );
}

function Summary({ result, q }: { result: FullTextPage; q: string }) {
  return (
    <p className="mb-6 text-ink-soft">
      {result.total.toLocaleString('en')} {result.total === 1 ? 'book contains' : 'books contain'} “{q}”
      {result.alsoSearched ? <> or “{result.alsoSearched}”</> : null}.
    </p>
  );
}

function HitRow({ hit, q, localFile }: { hit: FullTextHit; q: string; localFile?: string }) {
  const href = itemHref(hit.identifier, 'books');
  const meta = [hit.creator, hit.year, hit.language].filter(Boolean).join(', ');
  const readHere = localFile ? `/reader?${new URLSearchParams({ file: localFile, find: q, ...(hit.page ? { page: String(hit.page) } : {}) })}` : null;
  const onArchive = `https://archive.org/details/${encodeURIComponent(hit.identifier)}${hit.page ? `/page/n${hit.page - 1}` : ''}?${new URLSearchParams({ q })}`;
  return (
    <li className="flex gap-5 py-6">
      <Link href={href} className="w-20 shrink-0" tabIndex={-1} aria-hidden>
        <Cover src={archiveThumb(hit.identifier)} title={hit.title} subtitle={hit.creator} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={href} className="font-title text-xl text-ink hover:text-accent">
              {hit.title}
            </Link>
            {meta ? <p className="mt-0.5 text-sm text-ink-soft">{meta}</p> : null}
          </div>
          <SelectToggle item={{ identifier: hit.identifier, title: hit.title, section: 'books', year: hit.year, thumbnail: archiveThumb(hit.identifier) }} className="shrink-0" />
        </div>
        {hit.passages.length ? (
          <ul className="mt-3 space-y-2">
            {hit.passages.map((parts, i) => (
              <li key={i} className="max-w-[72ch] border-l-2 border-rule pl-3 text-ink-soft">
                …
                {parts.map((p, j) =>
                  p.hit ? (
                    <mark key={j} className="rounded-[2px] bg-[rgb(250_214_60/0.45)] px-0.5 text-ink">
                      {p.text}
                    </mark>
                  ) : (
                    <span key={j}>{p.text}</span>
                  ),
                )}
                …
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          {readHere ? (
            <Link href={readHere} className="rounded-full bg-accent px-3.5 py-1.5 font-medium text-accent-ink hover:opacity-90">
              Read here{hit.page ? `, page ${hit.page}` : ''}
            </Link>
          ) : null}
          <a href={onArchive} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
            {readHere ? 'Open on archive.org' : `Open on archive.org${hit.page ? ` at page ${hit.page}` : ', with this search'}`} <ExternalLink aria-hidden className="size-3.5" />
          </a>
        </div>
      </div>
    </li>
  );
}
