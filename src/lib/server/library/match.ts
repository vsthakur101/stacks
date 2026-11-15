import { eq } from 'drizzle-orm';
import { getItem, searchArchive } from '../catalog/archive';
import { escapeLucene } from '../catalog/normalize';
import { getDb } from '../db/client';
import { fileLinks } from '../db/schema';
import { invalidateLibraryScan, type LibraryFile } from './scan';

/**
 * Match your own files: a file without "[identifier]" in its name gets candidate archive.org items
 * from a title guessed from its name; a candidate with a file of exactly the same size is almost
 * certainly the same scan. Linking is recorded here; the file is never renamed.
 */

export interface MatchCandidate {
  identifier: string;
  title: string;
  creator?: string;
  year?: number;
  thumbnail: string;
  /** One of the item's files has exactly this file's size. */
  sameSize: boolean;
}

const NOISE = /\b(pdf|epub|djvu|txt|ebook|e-book|scan(ned)?|by|the|and|of|in|ocr|hindi|sanskrit|book|part|vol|volume)\b/gi;

/** "Geeta_Ki-Vibhuti (1900) by X.pdf" → "Geeta Ki Vibhuti X"; years are dropped (archive.org dates differ). */
export function guessTitle(name: string): string {
  return name
    .replace(/\.[A-Za-z0-9]{1,8}$/, '')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ')
    .replace(/[_.\-–—+]+/g, ' ')
    .replace(/\b(1[5-9]|20)\d\d\b/g, ' ')
    .replace(NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CANDIDATES = 6;

export async function matchCandidates(file: LibraryFile, query?: string): Promise<{ guess: string; candidates: MatchCandidate[] }> {
  const guess = query?.trim() || guessTitle(file.name);
  const words = guess.split(' ').filter((w) => w.length > 1);
  if (!words.length) return { guess, candidates: [] };
  const terms = words.map((w) => escapeLucene(w)).join(' AND ');
  // Title words first; if nothing has them all in its title, anywhere in the record.
  let page = await searchArchive({ query: `title:(${terms}) AND mediatype:texts`, pageSize: CANDIDATES, sort: ['downloads desc'] });
  if (!page.total) page = await searchArchive({ query: `(${terms}) AND mediatype:texts`, pageSize: CANDIDATES, sort: ['downloads desc'] });
  // Spellings differ (Vibhuti / Vibhoti): titles with most of the words, best match first.
  // Short words ("Ki", "Aur") match everything, so only longer ones count here.
  const strong = words.filter((w) => [...w].length >= 4);
  if (!page.total && strong.length > 1) {
    page = await searchArchive({ query: `title:(${strong.map((w) => escapeLucene(w)).join(' OR ')}) AND mediatype:texts`, pageSize: CANDIDATES * 2 });
  }

  const candidates = await Promise.all(
    page.results.map(async (c): Promise<MatchCandidate> => {
      let sameSize = false;
      try {
        sameSize = (await getItem(c.identifier)).files.some((f) => Number(f.size) === file.size);
      } catch {
        // Metadata unavailable: no size check.
      }
      return { identifier: c.identifier, title: c.title, creator: c.creator, year: c.year, thumbnail: c.thumbnail, sameSize };
    }),
  );
  candidates.sort((a, b) => Number(b.sameSize) - Number(a.sameSize));
  return { guess, candidates };
}

export function linkFile(file: LibraryFile, identifier: string): void {
  const row = { file: file.relative, identifier, name: file.name, size: file.size, linkedAt: Date.now() };
  getDb().insert(fileLinks).values(row).onConflictDoUpdate({ target: fileLinks.file, set: row }).run();
  invalidateLibraryScan();
}

export function unlinkFile(relative: string): boolean {
  const removed = getDb().delete(fileLinks).where(eq(fileLinks.file, relative)).run().changes > 0;
  invalidateLibraryScan();
  return removed;
}
