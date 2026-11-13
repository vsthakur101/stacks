import { and, desc, eq, isNotNull } from 'drizzle-orm';
import fs from 'node:fs';
import { getDb } from '../db/client';
import { downloadTasks } from '../db/schema';

/**
 * What's on disk: finished downloads whose files still exist. The DB says what we fetched; the
 * existence check covers files the owner has since moved or deleted.
 */
export function downloadedFiles(): Map<string, string[]> {
  const rows = getDb()
    .select({ identifier: downloadTasks.identifier, destPath: downloadTasks.destPath })
    .from(downloadTasks)
    .where(and(eq(downloadTasks.state, 'done'), isNotNull(downloadTasks.destPath)))
    .orderBy(desc(downloadTasks.updatedAt))
    .all();
  const out = new Map<string, string[]>();
  for (const { identifier, destPath } of rows) {
    if (!destPath || !fs.existsSync(destPath)) continue;
    const list = out.get(identifier) ?? [];
    if (!list.includes(destPath)) list.push(destPath);
    out.set(identifier, list);
  }
  return out;
}

export function filesFor(identifier: string): string[] {
  return downloadedFiles().get(identifier) ?? [];
}
