import { and, desc, eq, isNotNull } from 'drizzle-orm';
import fs from 'node:fs';
import { getDb } from '../db/client';
import { downloadTasks } from '../db/schema';
import { scanLibrary } from '../library/scan';
import { getSettings } from '../settings';

/**
 * What's on disk, per archive.org identifier. Two sources, merged:
 * - the download folder itself (survives "Clear finished" and files moved within the folder);
 * - finished downloads in history whose files still exist (covers a download folder changed later).
 */
export async function downloadedFiles(): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  const add = (identifier: string, file: string) => {
    const list = out.get(identifier) ?? [];
    if (!list.includes(file)) list.push(file);
    out.set(identifier, list);
  };

  const scan = await scanLibrary(getSettings().downloadRoot);
  for (const item of scan.items) for (const f of item.files) add(item.identifier, f.path);

  const rows = getDb()
    .select({ identifier: downloadTasks.identifier, destPath: downloadTasks.destPath })
    .from(downloadTasks)
    .where(and(eq(downloadTasks.state, 'done'), isNotNull(downloadTasks.destPath)))
    .orderBy(desc(downloadTasks.updatedAt))
    .all();
  for (const { identifier, destPath } of rows) {
    if (destPath && fs.existsSync(destPath)) add(identifier, destPath);
  }
  return out;
}

export async function filesFor(identifier: string): Promise<string[]> {
  return (await downloadedFiles()).get(identifier) ?? [];
}
