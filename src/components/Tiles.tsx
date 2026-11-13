import Link from 'next/link';
import type { ItemCard, SectionId, TrayItem, WorkCard } from '@/lib/shared/types';
import { Cover } from './Cover';
import { SelectToggle, WorkSelectToggle } from './SelectToggle';

export function itemToTray(card: ItemCard, section: SectionId, publication?: string): TrayItem {
  return {
    identifier: card.identifier,
    title: card.title,
    section,
    publication,
    year: card.year,
    date: card.date,
    thumbnail: card.thumbnail,
  };
}

export function itemHref(identifier: string, section: SectionId, publication?: string): string {
  const p = new URLSearchParams({ s: section });
  if (publication) p.set('p', publication);
  return `/item/${encodeURIComponent(identifier)}?${p}`;
}

const gridClass = 'grid grid-cols-2 gap-x-5 gap-y-9 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6';

export function TileGrid({ children }: { children: React.ReactNode }) {
  return <ul className={gridClass}>{children}</ul>;
}

export function WorkTile({ work }: { work: WorkCard }) {
  const authors = work.authors.map((a) => a.name).join(', ');
  const free = work.access === 'public';
  return (
    <li className="group relative">
      <Link href={`/books/${work.workId}`} className="block">
        <Cover src={work.cover} title={work.title} subtitle={authors} />
        <h3 className="mt-3 line-clamp-2 font-serif text-base leading-snug text-ink group-hover:text-accent">{work.title}</h3>
      </Link>
      <p className="mt-0.5 line-clamp-1 text-sm text-ink-soft">
        {authors || 'Unknown author'}
        {work.year ? `, ${work.year}` : ''}
      </p>
      {free ? (
        <WorkSelectToggle
          scanIds={work.scanIds}
          base={{ title: work.title, year: work.year, thumbnail: work.cover }}
          className="absolute top-2 left-2"
        />
      ) : (
        <p className="mt-1 text-xs text-ink-faint">Borrow-only</p>
      )}
    </li>
  );
}

export function ItemTile({
  card,
  section,
  publication,
  href,
}: {
  card: ItemCard;
  section: SectionId;
  publication?: string;
  href?: string;
}) {
  const target = href ?? (card.isCollection ? `/${section}/${card.identifier}` : itemHref(card.identifier, section, publication));
  const meta = card.isCollection
    ? card.itemCount
      ? `${card.itemCount.toLocaleString('en')} items`
      : undefined
    : (card.date ?? card.creator);
  return (
    <li className="group relative">
      <Link href={target} className="block">
        <Cover src={card.thumbnail} title={card.title} subtitle={meta} shape="page" />
        <h3 className="mt-3 line-clamp-2 font-serif text-base leading-snug text-ink group-hover:text-accent">{card.title}</h3>
      </Link>
      {meta ? <p className="mt-0.5 line-clamp-1 text-sm text-ink-soft">{meta}</p> : null}
      {card.isCollection ? null : (
        <SelectToggle item={itemToTray(card, section, publication)} className="absolute top-2 left-2" />
      )}
    </li>
  );
}
