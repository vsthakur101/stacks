import type { Fallback, FriendlyFormat } from '@/lib/shared/types';
import type { ArchiveFile } from '../catalog/archive';

/** archive.org `format` values per friendly format, highest priority first. */
export const FORMAT_SOURCES: Record<FriendlyFormat, readonly string[]> = {
  pdf: ['Text PDF', 'Additional Text PDF', 'Image Container PDF', 'PDF'],
  epub: ['EPUB'],
  text: ['DjVuTXT'],
  djvu: ['DjVu'],
  images: ['Single Page Processed JP2 ZIP'],
};

export function isPrivate(file: ArchiveFile): boolean {
  return file.private === true || file.private === 'true';
}

export function fileSize(file: ArchiveFile): number | null {
  const n = Number(file.size);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Files to download for `format`: all public files of the highest-priority archive.org format present.
 * Encrypted variants (LCP/ACS) never match because they have their own format names.
 */
export function pickFiles(files: readonly ArchiveFile[], format: FriendlyFormat): ArchiveFile[] {
  const publicFiles = files.filter((f) => !isPrivate(f) && isSafeSubpath(f.name));
  for (const source of FORMAT_SOURCES[format]) {
    const matches = publicFiles.filter((f) => f.format === source);
    if (matches.length > 0) return matches.sort((a, b) => a.name.localeCompare(b.name));
  }
  return [];
}

/** Applies the fallback rule: requested format, else the fallback format, else nothing. */
export function resolveFiles(
  files: readonly ArchiveFile[],
  format: FriendlyFormat,
  fallback: Fallback,
): { format: FriendlyFormat; files: ArchiveFile[] } | null {
  const primary = pickFiles(files, format);
  if (primary.length > 0) return { format, files: primary };
  if (fallback !== 'skip' && fallback !== format) {
    const alt = pickFiles(files, fallback);
    if (alt.length > 0) return { format: fallback, files: alt };
  }
  return null;
}

export function availability(files: readonly ArchiveFile[]): Map<FriendlyFormat, number> {
  const out = new Map<FriendlyFormat, number>();
  for (const format of Object.keys(FORMAT_SOURCES) as FriendlyFormat[]) {
    const picked = pickFiles(files, format);
    if (picked.length > 0) out.set(format, picked.reduce((sum, f) => sum + (fileSize(f) ?? 0), 0));
  }
  return out;
}

/** Item file names may contain subdirectories; reject traversal and absolute paths. */
function isSafeSubpath(name: string): boolean {
  return !name.startsWith('/') && !name.split('/').some((seg) => seg === '..' || seg === '');
}
