import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Cover } from '@/components/Cover';
import { SelectAllButton, SelectToggle } from '@/components/SelectToggle';
import { PageHeading, Unreachable } from '@/components/States';
import { itemHref, itemToTray, TileGrid } from '@/components/Tiles';
import { loadSet } from '@/lib/server/catalog/sets';
import { SECTIONS } from '@/lib/server/catalog/sections';
import { isSafeStem, rangeLabel } from '@/lib/server/catalog/volumes';
import { attempt, str, type SearchParams } from '@/lib/server/pageParams';
import { isSectionId } from '@/lib/shared/types';

export const dynamic = 'force-dynamic';
type Params = Promise<{ stem: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const stem = decodeURIComponent((await params).stem);
  const set = isSafeStem(stem) ? await attempt(() => loadSet(stem)) : null;
  return { title: set?.title ?? 'Set' };
}

/** All volumes of a multi-volume set, in order, with one button to select them all. */
export default async function SetPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const stem = decodeURIComponent((await params).stem);
  if (!isSafeStem(stem)) notFound();
  const s = str((await searchParams).s);
  const section = isSectionId(s) ? s : 'books';
  const set = await attempt(() => loadSet(stem));
  if (set === null) return <Unreachable what="this set" />;

  const tray = set.volumes.map((v) => itemToTray(v.card, section));
  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-6 text-sm text-ink-soft">
        <Link href={`/${section}`} className="hover:text-accent">
          {SECTIONS[section].name}
        </Link>
      </nav>
      <PageHeading
        title={set.title}
        lede={`${set.volumes.length} ${set.volumes.length === 1 ? 'volume' : 'volumes'} on archive.org, ${rangeLabel(set.word, set.volumes.map((v) => v.n)).toLowerCase()}`}
      >
        <div className="mt-5">
          <SelectAllButton items={tray} label={`all ${set.volumes.length} volumes to your selection`} />
        </div>
      </PageHeading>
      <TileGrid>
        {set.volumes.map(({ card, n }, i) => (
          <li key={card.identifier} className="group relative">
            <Link href={itemHref(card.identifier, section)} className="block">
              <Cover src={card.thumbnail} title={card.title} subtitle={`${set.word} ${n}`} shape="page" />
              <p className="mt-3.5 text-sm font-medium text-accent">
                {set.word} {n}
              </p>
              <h3 className="font-title line-clamp-2 text-[1.05rem] text-ink group-hover:text-accent">{card.title}</h3>
            </Link>
            {card.date ? <p className="mt-1 text-sm text-ink-soft">{card.date}</p> : null}
            <SelectToggle item={tray[i]!} className="absolute top-2 left-2" />
          </li>
        ))}
      </TileGrid>
    </>
  );
}
