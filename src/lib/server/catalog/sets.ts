import type { ItemCard } from '@/lib/shared/types';
import { TTL } from '../http';
import { searchArchive } from './archive';
import { groupVolumes, isSafeStem, volumeOf, type GroupedCard, type SetCard } from './volumes';

export interface FullSet {
  stem: string;
  title: string;
  word: string;
  volumes: { card: ItemCard; n: number }[];
}

/**
 * Every volume of a set on archive.org: identifiers matching the stem (wildcard for the number),
 * kept only if they pass the same volume rules, one per volume number (most downloaded wins).
 */
export async function loadSet(stem: string): Promise<FullSet | null> {
  if (!isSafeStem(stem)) return null;
  const pattern = setPattern(stem);
  if (!pattern) return null;
  const page = await searchArchive({
    query: `identifier:${pattern} AND mediatype:texts AND NOT collection:(inlibrary OR printdisabled)`,
    pageSize: 200,
    sort: ['downloads desc'],
    ttl: TTL.listing,
  });
  const byNumber = new Map<number, ItemCard>();
  let title = '';
  let word = 'Volume';
  for (const card of page.results) {
    const v = volumeOf(card);
    if (!v || v.stem !== stem || byNumber.has(v.n)) continue;
    byNumber.set(v.n, card);
    if (!title) {
      title = v.base;
      word = v.word;
    }
  }
  if (byNumber.size === 0) return null;
  return {
    stem,
    title,
    word,
    volumes: [...byNumber.entries()].sort((a, b) => a[0] - b[0]).map(([n, card]) => ({ n, card })),
  };
}

/**
 * Groups a page of results into sets using each set's full membership, not just the volumes that
 * happen to be on this page: archive.org's ranking spreads volumes across pages ("siva purana" puts
 * only Part 4 on page 1). One cached lookup per distinct set, at most 10 per page.
 */
export async function groupWithFullSets(cards: ItemCard[]): Promise<GroupedCard[]> {
  const stems = [...new Set(cards.map((c) => volumeOf(c)?.stem).filter((s): s is string => Boolean(s)))].slice(0, 10);
  const loaded = await Promise.all(stems.map(async (stem) => [stem, await loadSet(stem).catch(() => null)] as const));
  const full = new Map(loaded.filter(([, set]) => set && set.volumes.length >= 2) as [string, FullSet][]);
  const pageLevel = new Map(
    groupVolumes(cards)
      .filter((g): g is SetCard => g.kind === 'set')
      .map((g) => [g.stem, g]),
  );

  const out: GroupedCard[] = [];
  const placed = new Set<string>();
  for (const card of cards) {
    const stem = volumeOf(card)?.stem;
    const set: SetCard | undefined = stem
      ? full.has(stem)
        ? { kind: 'set', stem, title: full.get(stem)!.title, word: full.get(stem)!.word, volumes: full.get(stem)!.volumes }
        : pageLevel.get(stem)
      : undefined;
    if (!set) out.push({ kind: 'item', card });
    else if (!placed.has(set.stem)) {
      placed.add(set.stem);
      out.push(set);
    }
  }
  return out;
}

/**
 * The identifier wildcard for a stem. "~" (a random four-character code plus separator) becomes five
 * single-character wildcards; "{n}" becomes "*". A stem that would start with "*" is refused: a
 * leading open wildcard would scan archive.org's whole index.
 */
export function setPattern(stem: string): string | null {
  if (!isSafeStem(stem)) return null;
  const coded = stem.startsWith('~');
  const [prefix, suffix] = (coded ? stem.slice(1) : stem).split('{n}') as [string, string];
  if (!coded && !prefix) return null;
  // No escaping: isSafeStem allows only letters, digits, '.', '_' and '-', all literal inside a term;
  // escaped hyphens next to '?' wildcards make archive.org's search backend fail (BACKEND_ERROR).
  return `${coded ? '?????' : ''}${prefix}*${suffix}`;
}
