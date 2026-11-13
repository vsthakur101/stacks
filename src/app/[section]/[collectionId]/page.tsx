import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { IssueList } from '@/components/IssueList';
import { Pager } from '@/components/Pager';
import { SelectAllButton } from '@/components/SelectToggle';
import { Empty, StaleNotice, Unreachable } from '@/components/States';
import { ItemTile, itemToTray, TileGrid } from '@/components/Tiles';
import {
  childCollections,
  dateSpan,
  getItem,
  isSafeIdentifier,
  itemsInCollection,
  itemsInYear,
  undatedItems,
} from '@/lib/server/catalog/archive';
import { plainText } from '@/lib/server/catalog/normalize';
import { ARCHIVE_SECTIONS, SECTIONS } from '@/lib/server/catalog/sections';
import { attempt, pageNum, str, type SearchParams } from '@/lib/server/pageParams';
import type { SectionId } from '@/lib/shared/types';
import { cn } from '@/lib/cn';

export const dynamic = 'force-dynamic';
type Params = Promise<{ section: string; collectionId: string }>;

async function load(params: Params) {
  const { section, collectionId } = await params;
  if (!(ARCHIVE_SECTIONS as readonly string[]).includes(section) || !isSafeIdentifier(collectionId)) notFound();
  return { section: section as SectionId, collectionId };
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { collectionId } = await load(params);
  return { title: (await attempt(() => getItem(collectionId)))?.title ?? collectionId };
}

export default async function PublicationPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { section, collectionId } = await load(params);
  const sp = await searchParams;
  const page = pageNum(sp.page);
  const yearParam = str(sp.year);

  const [meta, children, span] = await Promise.all([
    attempt(() => getItem(collectionId)),
    attempt(() => childCollections(collectionId)),
    attempt(() => dateSpan(collectionId)),
  ]);
  if (!meta && !children && !span) return <Unreachable what="this publication" />;

  const title = meta?.title ?? collectionId;
  const description = plainText(meta?.description);
  const years = span?.from && span.to ? range(span.to, span.from) : [];
  const year = yearParam === 'undated' ? 'undated' : yearParam && years.includes(Number(yearParam)) ? Number(yearParam) : years[0];

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-soft">
        <Link href={`/${section}`} className="hover:text-accent">
          {SECTIONS[section].name}
        </Link>
      </nav>
      <header className="mb-12 max-w-3xl">
        <h1 className="font-display text-3xl leading-tight text-ink sm:text-4xl">{title}</h1>
        {span && span.total > 0 ? (
          <p className="mt-3 text-lg text-ink-soft">
            {span.total.toLocaleString('en')} {span.total === 1 ? 'item' : 'items'}
            {span.from && span.to ? `, ${span.from === span.to ? span.from : `${span.from} to ${span.to}`}` : ''}
          </p>
        ) : null}
        {description ? <p className="prose-reading mt-5 line-clamp-4 text-ink-soft">{description}</p> : null}
      </header>
      {meta ? <StaleNotice stale={meta.stale} /> : null}

      {children && children.results.length > 0 ? (
        <section className="mb-16">
          <h2 className="mb-8 font-display text-2xl text-ink">
            {children.total.toLocaleString('en')} {children.total === 1 ? 'title' : 'titles'} in this collection
          </h2>
          <TileGrid>
            {children.results.map((c) => (
              <ItemTile key={c.identifier} card={c} section={section} />
            ))}
          </TileGrid>
          <Pager path={`/${section}/${collectionId}`} params={{}} page={page} total={children.total} pageSize={children.pageSize} />
        </section>
      ) : null}

      {years.length > 0 && year !== undefined ? (
        <section className="grid gap-10 md:grid-cols-[160px_minmax(0,1fr)]">
          <YearIndex section={section} collectionId={collectionId} years={years} current={year} />
          <div>
            {year === 'undated' ? (
              <Undated section={section} collectionId={collectionId} publication={title} page={page} />
            ) : (
              <Year section={section} collectionId={collectionId} publication={title} year={year} />
            )}
          </div>
        </section>
      ) : span && span.total > 0 ? (
        <AllItems section={section} collectionId={collectionId} publication={title} page={page} />
      ) : !children || children.results.length === 0 ? (
        <Empty title="This collection has no readable items." />
      ) : null}
    </>
  );
}

function YearIndex({ section, collectionId, years, current }: { section: SectionId; collectionId: string; years: number[]; current: number | 'undated' }) {
  const decades = new Map<number, number[]>();
  for (const y of years) decades.set(Math.floor(y / 10) * 10, [...(decades.get(Math.floor(y / 10) * 10) ?? []), y]);
  const href = (y: number | 'undated') => `/${section}/${collectionId}?year=${y}`;
  return (
    <nav aria-label="Years" className="md:sticky md:top-8 md:max-h-[85vh] md:self-start md:overflow-y-auto">
      <ul className="flex flex-wrap gap-x-4 gap-y-1 md:flex-col md:gap-0">
        {[...decades.entries()].map(([decade, ys]) => (
          <li key={decade} className="md:mb-3">
            <span className="hidden text-xs text-ink-faint md:block">{decade}s</span>
            <ul className="flex flex-wrap gap-x-3">
              {ys.map((y) => (
                <li key={y}>
                  <Link
                    href={href(y)}
                    aria-current={y === current ? 'page' : undefined}
                    className={cn('font-title tabular-nums', y === current ? 'text-accent underline underline-offset-4' : 'text-ink-soft hover:text-ink')}
                  >
                    {y}
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
        <li>
          <Link
            href={href('undated')}
            aria-current={current === 'undated' ? 'page' : undefined}
            className={cn('text-sm', current === 'undated' ? 'text-accent underline underline-offset-4' : 'text-ink-faint hover:text-ink')}
          >
            Undated
          </Link>
        </li>
      </ul>
    </nav>
  );
}

async function Year({ section, collectionId, publication, year }: { section: SectionId; collectionId: string; publication: string; year: number }) {
  const items = await attempt(() => itemsInYear(collectionId, year));
  if (!items) return <Unreachable what={`issues from ${year}`} />;
  if (items.results.length === 0) return <Empty title={`Nothing dated ${year}.`} />;
  return (
    <>
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="font-display text-2xl text-ink">
          {year}, {items.results.length.toLocaleString('en')} {items.results.length === 1 ? 'item' : 'items'}
        </h2>
        <SelectAllButton items={items.results.map((c) => itemToTray(c, section, publication))} label={`all of ${year} to your selection`} />
      </div>
      <IssueList items={items.results} section={section} publication={publication} />
    </>
  );
}

async function Undated({ section, collectionId, publication, page }: { section: SectionId; collectionId: string; publication: string; page: number }) {
  const items = await attempt(() => undatedItems(collectionId, page));
  if (!items) return <Unreachable what="undated items" />;
  if (items.results.length === 0) return <Empty title="Every item here has a date." />;
  return (
    <>
      <h2 className="mb-8 font-display text-2xl text-ink">Undated, {items.total.toLocaleString('en')} items</h2>
      <TileGrid>
        {items.results.map((c) => (
          <ItemTile key={c.identifier} card={c} section={section} publication={publication} />
        ))}
      </TileGrid>
      <Pager path={`/${section}/${collectionId}`} params={{ year: 'undated' }} page={page} total={items.total} pageSize={items.pageSize} />
    </>
  );
}

async function AllItems({ section, collectionId, publication, page }: { section: SectionId; collectionId: string; publication: string; page: number }) {
  const items = await attempt(() => itemsInCollection(collectionId, page));
  if (!items) return <Unreachable what="items" />;
  return (
    <>
      <div className="mb-8 flex flex-wrap items-baseline justify-between gap-4">
        <h2 className="font-display text-2xl text-ink">Items, most read first</h2>
        <SelectAllButton items={items.results.map((c) => itemToTray(c, section, publication))} label="this page to your selection" />
      </div>
      <TileGrid>
        {items.results.map((c) => (
          <ItemTile key={c.identifier} card={c} section={section} publication={publication} />
        ))}
      </TileGrid>
      <Pager path={`/${section}/${collectionId}`} params={{}} page={page} total={items.total} pageSize={items.pageSize} />
    </>
  );
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let y = from; y >= to; y--) out.push(y);
  return out;
}
