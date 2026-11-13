import Link from 'next/link';
import type { ItemCard, SectionId, TrayItem, WorkCard } from '@/lib/shared/types';
import { Cover } from './Cover';
import { DownloadedMark } from './DownloadedMark';
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

/** Covers grow with the window: as many ≥150px columns as fit. `shelf` keeps it to a single row. */
export function TileGrid({ children, shelf }: { children: React.ReactNode; shelf?: boolean }) {
  return (
    <ul
      className={`grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-x-6 gap-y-10 sm:grid-cols-[repeat(auto-fill,minmax(168px,1fr))] ${shelf ? 'shelf' : ''}`}
    >
      {children}
    </ul>
  );
}

export function WorkTile({ work }: { work: WorkCard }) {
  const authors = work.authors.map((a) => a.name).join(', ');
  const free = work.access === 'public';
  return (
    <li className="group relative">
      <Link href={`/books/${work.workId}`} className="block">
        <div className="relative">
          <Cover src={work.cover} title={work.title} subtitle={authors} />
          <DownloadedMark identifiers={work.scanIds} className="absolute right-2 bottom-2" />
        </div>
        <h3 className="mt-3.5 line-clamp-2 font-title text-[1.05rem] text-ink group-hover:text-accent">{work.title}</h3>
      </Link>
      {authors || work.year ? (
        <p className="mt-1 line-clamp-1 text-sm text-ink-soft">{[authors, work.year].filter(Boolean).join(', ')}</p>
      ) : null}
      {free ? (
        <WorkSelectToggle
          scanIds={work.scanIds}
          base={{ title: work.title, year: work.year, thumbnail: work.cover }}
          className="absolute top-2 left-2"
        />
      ) : (
        <p className="mt-1 text-xs text-ink-faint">Borrow only</p>
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
        <div className="relative">
          <Cover src={card.thumbnail} title={card.title} subtitle={meta} shape="page" />
          {card.isCollection ? null : <DownloadedMark identifiers={[card.identifier]} className="absolute right-2 bottom-2" />}
        </div>
        <h3 className="mt-3.5 line-clamp-2 font-title text-[1.05rem] text-ink group-hover:text-accent">{card.title}</h3>
      </Link>
      {meta ? <p className="mt-1 line-clamp-1 text-sm text-ink-soft">{meta}</p> : null}
      {card.isCollection ? null : (
        <SelectToggle item={itemToTray(card, section, publication)} className="absolute top-2 left-2" />
      )}
    </li>
  );
}
