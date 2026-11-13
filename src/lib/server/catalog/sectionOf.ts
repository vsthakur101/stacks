import type { SectionId } from '@/lib/shared/types';
import { ARCHIVE_SECTIONS, SECTIONS } from './sections';

/** Best guess at which section an archive.org item belongs to, from its collections. */
export function sectionOf(collections: string[]): SectionId {
  for (const id of ARCHIVE_SECTIONS) {
    const cfg = SECTIONS[id];
    const known = [...cfg.roots, ...(cfg.curatedCollections ?? [])];
    if (collections.some((c) => known.includes(c))) return id;
  }
  return 'books';
}
