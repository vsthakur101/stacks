import path from 'node:path';
import type { SectionId, TrayItem } from '@/lib/shared/types';
import { SECTIONS } from '../catalog/sections';

const MAX_NAME_BYTES = 200;
const FORBIDDEN = /[/\\:*?"<>|\u0000-\u001f\u007f]/g;

/** One path segment: no separators, no control chars, no leading dots, bounded length. */
export function sanitizeSegment(input: string, maxBytes = MAX_NAME_BYTES): string {
  let s = input.normalize('NFC').replace(FORBIDDEN, ' ').replace(/\s+/g, ' ').replace(/^[.\s]+/, '').trim();
  if (!s) s = 'Untitled';
  return truncateBytes(s, maxBytes);
}

export function truncateBytes(s: string, maxBytes: number): string {
  if (Buffer.byteLength(s) <= maxBytes) return s;
  let out = '';
  for (const ch of s) {
    if (Buffer.byteLength(out + ch) > maxBytes - 1) break;
    out += ch;
  }
  return `${out.trimEnd()}…`;
}

/** archive.org derivative names like `foo_djvu.txt` → `.txt`; `foo_jp2.zip` → `.zip`. */
export function extensionOf(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : '';
}

const SECTION_FOLDERS: Record<SectionId, string> = {
  books: 'Books',
  newspapers: 'Newspapers',
  magazines: 'Magazines',
  government: 'Government',
  manuscripts: 'Manuscripts',
};

export interface DestinationInput {
  item: TrayItem;
  /** Publication / agency name resolved from metadata when the tray item has none. */
  publicationFallback?: string;
  fileName: string;
  /** True when this item contributes several files of the chosen format. */
  multiFile: boolean;
}

/** Relative destination path (from the download root). See design §9. */
export function relativeDestination({ item, publicationFallback, fileName, multiFile }: DestinationInput): string {
  const id = `[${item.identifier}]`;
  const title = item.title;
  const year = item.year ? ` (${item.year})` : '';
  const publication = sanitizeSegment(item.publication ?? publicationFallback ?? 'Unsorted', 120);
  const sectionDir = SECTION_FOLDERS[item.section] ?? SECTIONS.books.name;

  let dirParts: string[];
  let stem: string;
  switch (item.section) {
    case 'newspapers':
    case 'magazines': {
      const date = item.date ? `${item.date} ` : '';
      dirParts = [sectionDir, publication];
      stem = `${date}${title}`;
      break;
    }
    case 'government':
      dirParts = [sectionDir, publication];
      stem = `${title}${year}`;
      break;
    case 'manuscripts':
      dirParts = [sectionDir];
      stem = title;
      break;
    default:
      dirParts = [sectionDir];
      stem = `${title}${year}`;
  }

  // Keep the identifier intact even when the title is truncated.
  const idBytes = Buffer.byteLength(` ${id}`);
  const base = `${sanitizeSegment(stem, MAX_NAME_BYTES - idBytes - 10)} ${id}`;

  if (multiFile) {
    const flat = fileName.split('/').map((s) => sanitizeSegment(s, 80)).join(' - ');
    return path.join(...dirParts, base, sanitizeSegment(flat));
  }
  return path.join(...dirParts, `${base}${extensionOf(fileName)}`);
}

/** Resolves against root and refuses anything that escapes it. */
export function absoluteDestination(root: string, relative: string): string {
  const resolvedRoot = path.resolve(root);
  const full = path.resolve(resolvedRoot, relative);
  if (!full.startsWith(resolvedRoot + path.sep)) throw new Error(`Refusing path outside download folder: ${relative}`);
  return full;
}
