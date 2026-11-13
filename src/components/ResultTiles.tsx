import Link from 'next/link';
import { groupWithFullSets } from '@/lib/server/catalog/sets';
import { rangeLabel, type SetCard } from '@/lib/server/catalog/volumes';
import type { ItemCard, SectionId } from '@/lib/shared/types';
import { Cover } from './Cover';
import { SetSelectToggle } from './SetSelectToggle';
import { ItemTile, itemToTray, TileGrid } from './Tiles';

/** Sections where volumes are grouped into sets (issues of newspapers and magazines aren't volumes). */
export const SET_SECTIONS: readonly SectionId[] = ['books', 'government', 'manuscripts'];

/** A results grid; with `group`, the volumes of a set become one card for the whole set. */
export async function ResultTiles({ cards, section, group }: { cards: ItemCard[]; section: SectionId; group: boolean }) {
  const items = group && SET_SECTIONS.includes(section) ? await groupWithFullSets(cards) : cards.map((card) => ({ kind: 'item' as const, card }));
  return (
    <TileGrid>
      {items.map((g) =>
        g.kind === 'set' ? <SetTile key={g.stem} set={g} section={section} /> : <ItemTile key={g.card.identifier} card={g.card} section={section} />,
      )}
    </TileGrid>
  );
}

export function setHref(stem: string, section: SectionId): string {
  return `/set/${encodeURIComponent(stem)}?s=${section}`;
}

/** A set: the first volume's cover with the others stacked behind it. */
function SetTile({ set, section }: { set: SetCard; section: SectionId }) {
  const first = set.volumes[0]!.card;
  const tray = set.volumes.map((v) => itemToTray(v.card, section));
  return (
    <li className="group relative">
      <Link href={setHref(set.stem, section)} className="block">
        <div className="relative mt-2 mr-2">
          <span aria-hidden className="t-cover absolute inset-0 translate-x-2 -translate-y-2 bg-rule" />
          <span aria-hidden className="t-cover absolute inset-0 translate-x-1 -translate-y-1 bg-raised ring-1 ring-rule" />
          <Cover src={first.thumbnail} title={set.title} subtitle={`${set.volumes.length} volumes`} shape="page" />
        </div>
        <h3 className="font-title mt-3.5 line-clamp-2 text-[1.05rem] text-ink group-hover:text-accent">{set.title}</h3>
      </Link>
      <p className="mt-1 text-sm text-ink-soft">
        {set.volumes.length} volumes, {rangeLabel(set.word, set.volumes.map((v) => v.n)).toLowerCase()}
      </p>
      <SetSelectToggle items={tray} title={set.title} className="absolute top-4 left-2" />
    </li>
  );
}
