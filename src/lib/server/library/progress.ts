import { desc, eq } from 'drizzle-orm';
import { getDb } from '../db/client';
import { readingProgress } from '../db/schema';
import { findLibraryFile } from './scan';

export interface Progress {
  file: string;
  identifier: string | null;
  title: string;
  page: number;
  total: number;
  /** EPUB: exact place (CFI). */
  position?: string | null;
  updatedAt: number;
}

export function getProgress(file: string): Progress | null {
  return getDb().select().from(readingProgress).where(eq(readingProgress.file, file)).get() ?? null;
}

export function saveProgress(p: Omit<Progress, 'updatedAt'>): void {
  const row = { ...p, page: Math.max(1, Math.min(p.page, p.total)), updatedAt: Date.now() };
  getDb()
    .insert(readingProgress)
    .values(row)
    .onConflictDoUpdate({ target: readingProgress.file, set: { page: row.page, total: row.total, title: row.title, identifier: row.identifier, position: row.position ?? null, updatedAt: row.updatedAt } })
    .run();
}

/** Recently read files that are still in the download folder, newest first. */
export async function recentlyRead(root: string, limit = 6): Promise<Progress[]> {
  const rows = getDb().select().from(readingProgress).orderBy(desc(readingProgress.updatedAt)).limit(limit * 3).all();
  const present: Progress[] = [];
  for (const row of rows) {
    if (present.length >= limit) break;
    if (await findLibraryFile(root, row.file)) present.push(row);
  }
  return present;
}
