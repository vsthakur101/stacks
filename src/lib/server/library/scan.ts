import fs from 'node:fs/promises';
import path from 'node:path';
import { isSectionId, type SectionId } from '@/lib/shared/types';

/**
 * The Library reads the download folder itself, not download history: clearing finished downloads
 * deletes history, and the owner may move files around. Stacks names every file (or, for multi-file
 * items, its folder) "… [archive-identifier]", which is how files are matched back to items.
 */

export interface LibraryFile {
  /** Absolute path, always inside the download root. */
  path: string;
  /** Path relative to the download root, for display and as a stable key. */
  relative: string;
  name: string;
  size: number;
  modifiedAt: number;
  ext: string;
}

export interface LibraryItem {
  identifier: string;
  section: SectionId;
  files: LibraryFile[];
  bytes: number;
  addedAt: number;
}

export interface LibraryScan {
  root: string;
  items: LibraryItem[];
  others: LibraryFile[];
}

const FOLDER_SECTIONS: Record<string, SectionId> = {
  books: 'books',
  newspapers: 'newspapers',
  magazines: 'magazines',
  government: 'government',
  manuscripts: 'manuscripts',
};

const ID_IN_NAME = /\[([A-Za-z0-9][A-Za-z0-9._-]{0,99})\](?:\.[A-Za-z0-9]{1,8})?$/;
const ID_IN_FOLDER = /\[([A-Za-z0-9][A-Za-z0-9._-]{0,99})\]$/;
const SKIP = /^\.|\.part$|\.tmp$/i;

/** The identifier a file belongs to: from its own name, else from the folder holding it. */
export function identifierFor(relative: string): string | undefined {
  const parts = relative.split(path.sep);
  const name = parts.at(-1) ?? '';
  const own = name.match(ID_IN_NAME)?.[1];
  if (own) return own;
  const folder = parts.at(-2);
  return folder?.match(ID_IN_FOLDER)?.[1];
}

export function sectionFor(relative: string): SectionId {
  const top = relative.split(path.sep)[0]?.toLowerCase() ?? '';
  const section = FOLDER_SECTIONS[top];
  return section && isSectionId(section) ? section : 'books';
}

/** "Pride and Prejudice (1813) [prideprejudice00aust].epub" → "Pride and Prejudice (1813)". */
export function titleFromFileName(name: string): string {
  return name
    .replace(/\.[A-Za-z0-9]{1,8}$/, '')
    .replace(/\s*\[[^\]]+\]\s*$/, '')
    .trim() || name;
}

async function walk(root: string, dir: string, out: LibraryFile[], depth: number): Promise<void> {
  if (depth > 6) return;
  let entries: import('node:fs').Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP.test(entry.name) || entry.isSymbolicLink()) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(root, full, out, depth + 1);
    } else if (entry.isFile()) {
      try {
        const stat = await fs.stat(full);
        out.push({
          path: full,
          relative: path.relative(root, full),
          name: entry.name,
          size: stat.size,
          modifiedAt: stat.mtimeMs,
          ext: path.extname(entry.name).slice(1).toLowerCase(),
        });
      } catch {
        /* vanished mid-scan */
      }
    }
  }
}

export async function scanFolder(root: string): Promise<LibraryScan> {
  const resolved = path.resolve(root);
  const files: LibraryFile[] = [];
  await walk(resolved, resolved, files, 0);

  const byId = new Map<string, LibraryItem>();
  const others: LibraryFile[] = [];
  for (const file of files) {
    const identifier = identifierFor(file.relative);
    if (!identifier) {
      others.push(file);
      continue;
    }
    const item = byId.get(identifier) ?? { identifier, section: sectionFor(file.relative), files: [], bytes: 0, addedAt: 0 };
    item.files.push(file);
    item.bytes += file.size;
    item.addedAt = Math.max(item.addedAt, file.modifiedAt);
    byId.set(identifier, item);
  }
  for (const item of byId.values()) item.files.sort((a, b) => a.name.localeCompare(b.name));
  return { root: resolved, items: [...byId.values()], others: others.sort((a, b) => b.modifiedAt - a.modifiedAt) };
}

/* A few seconds of memo: the header tick store, item pages and the Library may all ask at once. */
const globalForScan = globalThis as unknown as { __stacksScan?: { root: string; at: number; scan: Promise<LibraryScan> } };
const FRESH_MS = 5_000;

export function scanLibrary(root: string): Promise<LibraryScan> {
  const cached = globalForScan.__stacksScan;
  if (cached && cached.root === root && Date.now() - cached.at < FRESH_MS) return cached.scan;
  const scan = scanFolder(root);
  globalForScan.__stacksScan = { root, at: Date.now(), scan };
  return scan;
}

/** Call after a download finishes so the Library and ticks see it immediately. */
export function invalidateLibraryScan(): void {
  globalForScan.__stacksScan = undefined;
}
