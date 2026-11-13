import type { ItemCard } from '@/lib/shared/types';

/**
 * Multi-volume sets (spec: 2026-11-14-stacks-volumes-design.md).
 * Conservative on purpose: an item is a volume only with real evidence (archive.org's `volume`
 * field or a volume marker in its title), and volumes group only when their identifiers follow the
 * same pattern. A shared title alone never groups items, so different editions stay apart.
 */

const WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20,
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10,
};
const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50 };
const DEVANAGARI_DIGITS = '०१२३४५६७८९';

function fromRoman(s: string): number | null {
  const t = s.toLowerCase();
  if (!/^[ivxl]{1,6}$/.test(t)) return null;
  let total = 0;
  for (let i = 0; i < t.length; i++) {
    const v = ROMAN[t[i]!]!;
    const next = ROMAN[t[i + 1] ?? ''] ?? 0;
    total += v < next ? -v : v;
  }
  return total >= 1 && total <= 60 ? total : null;
}

/** "3", "03", "III", "three", "३" → 3. */
export function parseNumber(token: string): number | null {
  const t = token.trim().toLowerCase();
  if (/^[०-९]{1,3}$/.test(t)) return Number([...t].map((c) => DEVANAGARI_DIGITS.indexOf(c)).join(''));
  if (/^\d{1,3}$/.test(t)) {
    const n = Number(t);
    return n >= 1 && n <= 200 ? n : null;
  }
  return WORDS[t] ?? fromRoman(t);
}

const NUM = String.raw`(\d{1,3}|[०-९]{1,3}|[ivxl]{1,6}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)`;
const LATIN_MARKER = new RegExp(String.raw`\b(part|pt|vol|volume|book|khanda?|kanda?|bhaa?g)\b\.?\s*[-–:#]?\s*${NUM}\b(?:\s*of\s*(\d{1,3}))?`, 'i');
const DEVA_MARKER = new RegExp(String.raw`(खण्ड|खंड|भाग)\s*[-–:]?\s*([०-९\d]{1,3})`);

export interface VolumeInfo {
  n: number;
  /** The title without its volume marker, e.g. "Siva Purana - English Translation". */
  base: string;
  /** "Part", "Vol", "Khand"… as written, for the range label. */
  word: string;
  of?: number;
}

function cleanBase(s: string): string {
  return s
    .replace(/\s+/g, ' ')
    .replace(/[\s\-–:,(\[]+$/g, '')
    .replace(/^[\s\-–:,)\]]+/g, '')
    .replace(/\(\s*\)/g, '')
    .trim();
}

/** Volume number from archive.org's `volume` field or a marker in the title; null if there's no evidence. */
export function parseVolume(title: string, volumeField?: string): VolumeInfo | null {
  const field = volumeField?.match(/\d{1,3}|[ivxl]{1,6}/i)?.[0];
  const fromField = field ? parseNumber(field) : null;
  const latin = title.match(LATIN_MARKER);
  const deva = latin ? null : title.match(DEVA_MARKER);
  const m = latin ?? deva;
  const fromTitle = m ? parseNumber(m[2]!) : null;
  const n = fromField ?? fromTitle;
  if (!n) return null;
  const base = m && fromTitle ? cleanBase(title.replace(m[0], ' ')) : cleanBase(title);
  const word = m ? m[1]!.replace(/^./, (c) => c.toUpperCase()) : 'Volume';
  return { n, base: base || title, word: /^(pt|vol)$/i.test(word) ? (word.toLowerCase() === 'pt' ? 'Part' : 'Volume') : word, of: latin?.[3] ? Number(latin[3]) : undefined };
}

// Marker words in any case; the number must not run on into a lowercase word ("Partial" isn't "Part I"),
// but may run into a capitalised one (camel-case identifiers: "PartIIByGitaPress").
const ID_MARKER = /([Pp][Aa][Rr][Tt]|[Pp][Tt]|[Vv][Oo][Ll](?:[Uu][Mm][Ee])?|[Bb][Oo][Oo][Kk]|[Kk][Hh][Aa][Nn][Dd]|[Bb][Hh][Aa][Gg])([-_.]?)(\d{1,3}|[ivxl]{1,6}|[IVXL]{1,6})(?=[^a-z]|$)/g;

/**
 * The identifier with volume `n`'s token replaced by "{n}", e.g. SivaPuranaJ.L.ShastriPart1 →
 * SivaPuranaJ.L.ShastriPart{n}. Null if the identifier doesn't show the volume number.
 */
export function idStem(identifier: string, n: number): string | null {
  const stem = rawStem(identifier, n);
  if (!stem) return null;
  // Many uploads start with a random four-character code that differs for every volume of a set
  // (mWJT_mahabharata-vol.-2-…, NiAC_mahabharata-vol.-3-…). Treat it as "any four characters", but
  // only when the rest is long and specific enough that unrelated items can't match.
  const coded = stem.match(/^[A-Za-z0-9]{4}[_-](.{20,})$/);
  return coded ? `~${coded[1]}` : stem;
}

function rawStem(identifier: string, n: number): string | null {
  // 1. A marker followed by the number: …Part1…, …PartII…, …vol-03…
  for (const m of identifier.matchAll(ID_MARKER)) {
    if (parseNumber(m[3]!) === n) {
      const at = m.index! + m[1]!.length + m[2]!.length;
      return identifier.slice(0, at) + '{n}' + identifier.slice(at + m[3]!.length);
    }
  }
  // 2. The last run of digits equal to n: mahabharata01ramauoft → mahabharata{n}ramauoft
  const runs = [...identifier.matchAll(/\d+/g)].filter((r) => Number(r[0]) === n && r[0].length <= 3);
  const last = runs.at(-1);
  if (last) return identifier.slice(0, last.index!) + '{n}' + identifier.slice(last.index! + last[0].length);
  // 3. A Roman numeral between separators: valmiki-ramayan-ii-gita-press
  for (const m of identifier.matchAll(/(^|[-_.])([ivxl]{1,6})(?=[-_.]|$)/gi)) {
    if (fromRoman(m[2]!) === n) {
      const at = m.index! + m[1]!.length;
      return identifier.slice(0, at) + '{n}' + identifier.slice(at + m[2]!.length);
    }
  }
  return null;
}

export interface SetVolume {
  card: ItemCard;
  n: number;
}

export interface SetCard {
  kind: 'set';
  stem: string;
  title: string;
  word: string;
  volumes: SetVolume[];
}

export type GroupedCard = { kind: 'item'; card: ItemCard } | SetCard;

/** Volume info + stem for a card, or null if it isn't a groupable volume. */
export function volumeOf(card: ItemCard): (VolumeInfo & { stem: string }) | null {
  const info = parseVolume(card.title, card.volume);
  if (!info) return null;
  const stem = idStem(card.identifier, info.n);
  return stem ? { ...info, stem } : null;
}

/** Replaces each set's volumes with one set card at the position of its first volume. */
export function groupVolumes(cards: ItemCard[]): GroupedCard[] {
  const infos = cards.map((c) => ({ card: c, v: volumeOf(c) }));
  const byStem = new Map<string, typeof infos>();
  for (const x of infos) if (x.v) byStem.set(x.v.stem, [...(byStem.get(x.v.stem) ?? []), x]);
  const sets = new Map<string, SetCard>();
  for (const [stem, members] of byStem) {
    const numbers = new Set(members.map((m) => m.v!.n));
    if (numbers.size < 2) continue;
    const first = members[0]!.v!;
    sets.set(stem, {
      kind: 'set',
      stem,
      title: first.base,
      word: first.word,
      volumes: members
        .map((m) => ({ card: m.card, n: m.v!.n }))
        .sort((a, b) => a.n - b.n)
        .filter((v, i, all) => i === 0 || all[i - 1]!.n !== v.n),
    });
  }
  const out: GroupedCard[] = [];
  const placed = new Set<string>();
  for (const x of infos) {
    const set = x.v ? sets.get(x.v.stem) : undefined;
    if (!set) {
      out.push({ kind: 'item', card: x.card });
    } else if (!placed.has(set.stem)) {
      placed.add(set.stem);
      out.push(set);
    }
  }
  return out;
}

/** "Parts 1–4", "Volumes 1, 2, 4–6". */
export function rangeLabel(word: string, numbers: number[]): string {
  const sorted = [...new Set(numbers)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i;
    while (j + 1 < sorted.length && sorted[j + 1] === sorted[j]! + 1) j++;
    parts.push(j > i + 1 ? `${sorted[i]}–${sorted[j]}` : j === i + 1 ? `${sorted[i]}, ${sorted[j]}` : `${sorted[i]}`);
    i = j;
  }
  const plural = word.toLowerCase().endsWith('s') ? word : `${word}s`;
  return `${plural} ${parts.join(', ')}`;
}

/** A stem is safe to put in a URL and a search query: identifier characters, one {n}, optional leading ~. */
export function isSafeStem(stem: string): boolean {
  return /^~?[A-Za-z0-9._-]*\{n\}[A-Za-z0-9._-]*$/.test(stem) && stem.length <= 120;
}
