import type { SectionId } from '@/lib/shared/types';

export interface SectionConfig {
  id: SectionId;
  name: string;
  /** One line under the section title. */
  tagline: string;
  /** archive.org collections whose descendants make up this section. Empty for Books (Open Library). */
  roots: readonly string[];
  /**
   * Manuscripts has no clean root collection on archive.org, so its "publications" are a curated list.
   * For other sections, publications are the child collections of `roots`.
   */
  curatedCollections?: readonly string[];
  /** Words for the browse unit on the section page. */
  unit: { singular: string; plural: string };
}

export const SECTIONS: Record<SectionId, SectionConfig> = {
  books: {
    id: 'books',
    name: 'Books',
    tagline: 'Novels, classics, histories and textbooks, free to read.',
    roots: [],
    unit: { singular: 'book', plural: 'books' },
  },
  newspapers: {
    id: 'newspapers',
    name: 'Newspapers',
    tagline: 'Dailies, weeklies and broadsheets, issue by issue.',
    roots: ['newspapers'],
    unit: { singular: 'title', plural: 'titles' },
  },
  magazines: {
    id: 'magazines',
    name: 'Magazines',
    tagline: 'Periodicals, pulps and trade journals.',
    roots: ['magazine_rack', 'periodicals', 'pulpmagazinearchive'],
    unit: { singular: 'title', plural: 'titles' },
  },
  government: {
    id: 'government',
    name: 'Government',
    tagline: 'Reports, bulletins and publications from public agencies.',
    roots: ['fedlink', 'governmentpublications'],
    unit: { singular: 'agency', plural: 'agencies' },
  },
  manuscripts: {
    id: 'manuscripts',
    name: 'Manuscripts',
    tagline: 'Handwritten and historical documents from libraries worldwide.',
    roots: [],
    // Curated 2026-11-13: archive.org has no single manuscripts collection. Edit freely.
    curatedCollections: [
      'indic-manuscripts',
      'kashijangamwadimath',
      'dharmarthtrustjkcollectionbyegangotri',
      'folkscanomy_historical_texts',
      'mss-muslim-world',
      'muslim-world-manuscripts',
      'culhebrewmss',
      'bplscarwm',
      'nickersonmanuscripts',
      'vbpl-manuscripts',
    ],
    unit: { singular: 'collection', plural: 'collections' },
  },
};

export const ARCHIVE_SECTIONS: readonly SectionId[] = ['newspapers', 'magazines', 'government', 'manuscripts'];

/** Lucene clause restricting items to a section. */
export function sectionScope(section: SectionId): string {
  const cfg = SECTIONS[section];
  const collections = cfg.curatedCollections ?? cfg.roots;
  if (collections.length === 0) throw new Error(`Section ${section} is not archive.org-backed`);
  return `collection:(${collections.join(' OR ')})`;
}
