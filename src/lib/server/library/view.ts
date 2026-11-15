import { languageCodeFor, OTHER_LANGUAGE } from '@/lib/shared/languages';
import type { SectionId } from '@/lib/shared/types';
import { peekItem } from '../catalog/archive';
import { archiveThumb, formatDisplayDate } from '../catalog/normalize';
import { scanLibrary, titleFromFileName, type LibraryFile } from './scan';

export const LIBRARY_SORTS = {
  recent: 'Recently added',
  title: 'Title',
  size: 'Size',
} as const;
export type LibrarySort = keyof typeof LIBRARY_SORTS;

export interface LibraryEntry {
  identifier: string;
  section: SectionId;
  title: string;
  date?: string;
  language: string; // our code, or OTHER_LANGUAGE
  thumbnail: string;
  files: LibraryFile[];
  bytes: number;
  addedAt: number;
}

export interface LibraryView {
  entries: LibraryEntry[];
  others: LibraryFile[];
  /** Totals for the whole library, before filters. */
  totalItems: number;
  totalBytes: number;
  /** Sections and languages present, so filters only offer what exists. */
  sections: SectionId[];
  languages: string[];
}

export interface LibraryFilters {
  q?: string;
  section?: SectionId;
  lang?: string;
  /** Refs in the chosen collection ("item:…", "file:…"). */
  members?: ReadonlySet<string>;
  sort: LibrarySort;
}

/** The download folder, enriched with details we already have cached (never waits on the network). */
export async function buildLibrary(root: string, filters: LibraryFilters): Promise<LibraryView> {
  const scan = await scanLibrary(root);
  const all: LibraryEntry[] = scan.items.map((item) => {
    const meta = peekItem(item.identifier);
    return {
      identifier: item.identifier,
      section: item.section,
      title: meta?.title ?? titleFromFileName(item.files[0]?.name ?? item.identifier),
      date: formatDisplayDate(meta?.date),
      language: meta ? languageCodeFor(meta.language) : OTHER_LANGUAGE,
      thumbnail: archiveThumb(item.identifier),
      files: item.files,
      bytes: item.bytes,
      addedAt: item.addedAt,
    };
  });

  const q = filters.q?.toLocaleLowerCase();
  const matches = (text: string) => !q || text.toLocaleLowerCase().includes(q);
  const entries = all
    .filter((e) => !filters.section || e.section === filters.section)
    .filter((e) => !filters.lang || e.language === filters.lang)
    .filter((e) => !filters.members || filters.members.has(`item:${e.identifier}`))
    .filter((e) => matches(e.title) || e.files.some((f) => matches(f.name)) || matches(e.identifier));
  entries.sort((a, b) =>
    filters.sort === 'title'
      ? a.title.localeCompare(b.title)
      : filters.sort === 'size'
        ? b.bytes - a.bytes
        : b.addedAt - a.addedAt,
  );

  return {
    entries,
    others: scan.others.filter((f) => matches(f.name) && (!filters.members || filters.members.has(`file:${f.relative}`))),
    totalItems: all.length,
    totalBytes: all.reduce((n, e) => n + e.bytes, 0) + scan.others.reduce((n, f) => n + f.size, 0),
    sections: [...new Set(all.map((e) => e.section))],
    languages: [...new Set(all.map((e) => e.language))],
  };
}
