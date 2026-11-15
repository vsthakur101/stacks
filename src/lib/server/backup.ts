import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { getDb } from './db/client';
import { annotations, bookPrefs, readingProgress, savedShelves, searchHistory, settings } from './db/schema';
import { getSettings } from './settings';

/**
 * Backup and restore of everything the owner made: highlights, notes, bookmarks (and their names),
 * reading positions, printed-page offsets, Home shelves, search history, settings. Caches (archive.org
 * responses, extracted book text, covers) are rebuilt on demand and left out.
 *
 * Restoring merges: rows missing here are added, rows changed later in the backup replace older
 * ones, and nothing here is ever deleted. A daily copy is kept in a hidden folder of the download
 * folder (which the owner's own backup of ~/Books also covers).
 */

export const BACKUP_VERSION = 1;
const KEEP_DAILY = 30;
export const BACKUP_DIR_NAME = '.stacks-backups';

const annotationRow = z.object({
  id: z.string().min(1).max(100),
  file: z.string().min(1).max(1000),
  identifier: z.string().max(200).nullable(),
  page: z.number().int().min(1),
  kind: z.enum(['highlight', 'bookmark', 'note']),
  rectJson: z.string().max(200).nullable(),
  color: z.string().max(20).nullable(),
  note: z.string().max(10_000).nullable(),
  text: z.string().max(4_000).nullable(),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
const progressRow = z.object({
  file: z.string().min(1).max(1000),
  identifier: z.string().max(200).nullable(),
  title: z.string().max(2000),
  page: z.number().int(),
  total: z.number().int(),
  updatedAt: z.number().int(),
});
const prefsRow = z.object({ file: z.string().min(1).max(1000), pageOffset: z.number().int().nullable(), updatedAt: z.number().int() });
const shelfRow = z.object({ id: z.string().min(1).max(100), title: z.string().max(500), path: z.string().max(2000), paramsJson: z.string().max(20_000), createdAt: z.number().int() });
const historyRow = z.object({
  key: z.string().min(1).max(4000),
  path: z.string().max(2000),
  paramsJson: z.string().max(20_000),
  label: z.string().max(2000),
  lastUsedAt: z.number().int(),
  uses: z.number().int(),
});
const settingRow = z.object({ key: z.string().min(1).max(100), value: z.string().max(10_000) });

export const backupSchema = z.object({
  app: z.literal('stacks'),
  version: z.literal(BACKUP_VERSION),
  exportedAt: z.number().int(),
  tables: z.object({
    annotations: z.array(annotationRow).default([]),
    readingProgress: z.array(progressRow).default([]),
    bookPrefs: z.array(prefsRow).default([]),
    savedShelves: z.array(shelfRow).default([]),
    searchHistory: z.array(historyRow).default([]),
    settings: z.array(settingRow).default([]),
  }),
});
export type Backup = z.infer<typeof backupSchema>;

export function createBackup(): Backup {
  const db = getDb();
  return {
    app: 'stacks',
    version: BACKUP_VERSION,
    exportedAt: Date.now(),
    tables: {
      annotations: db.select().from(annotations).all() as Backup['tables']['annotations'],
      readingProgress: db.select().from(readingProgress).all(),
      bookPrefs: db.select().from(bookPrefs).all(),
      savedShelves: db.select().from(savedShelves).all(),
      searchHistory: db.select().from(searchHistory).all(),
      settings: db.select().from(settings).all(),
    },
  };
}

export interface RestoreCount {
  added: number;
  updated: number;
}
export type RestoreSummary = Record<keyof Backup['tables'], RestoreCount>;

/** Merges a backup into this database. Never deletes; newer rows win; local settings are kept. */
export function restoreBackup(raw: unknown): RestoreSummary {
  const backup = backupSchema.parse(raw);
  const t = backup.tables;
  const count = (): RestoreCount => ({ added: 0, updated: 0 });
  const summary: RestoreSummary = { annotations: count(), readingProgress: count(), bookPrefs: count(), savedShelves: count(), searchHistory: count(), settings: count() };

  getDb().transaction((tx) => {
    for (const row of t.annotations) {
      const here = tx.select({ updatedAt: annotations.updatedAt }).from(annotations).where(eq(annotations.id, row.id)).get();
      if (!here) {
        tx.insert(annotations).values(row).run();
        summary.annotations.added++;
      } else if (row.updatedAt > here.updatedAt) {
        tx.update(annotations).set(row).where(eq(annotations.id, row.id)).run();
        summary.annotations.updated++;
      }
    }
    for (const row of t.readingProgress) {
      const here = tx.select({ updatedAt: readingProgress.updatedAt }).from(readingProgress).where(eq(readingProgress.file, row.file)).get();
      if (!here) {
        tx.insert(readingProgress).values(row).run();
        summary.readingProgress.added++;
      } else if (row.updatedAt > here.updatedAt) {
        tx.update(readingProgress).set(row).where(eq(readingProgress.file, row.file)).run();
        summary.readingProgress.updated++;
      }
    }
    for (const row of t.bookPrefs) {
      const here = tx.select({ updatedAt: bookPrefs.updatedAt }).from(bookPrefs).where(eq(bookPrefs.file, row.file)).get();
      if (!here) {
        tx.insert(bookPrefs).values(row).run();
        summary.bookPrefs.added++;
      } else if (row.updatedAt > here.updatedAt) {
        tx.update(bookPrefs).set(row).where(eq(bookPrefs.file, row.file)).run();
        summary.bookPrefs.updated++;
      }
    }
    for (const row of t.savedShelves) {
      if (tx.select({ id: savedShelves.id }).from(savedShelves).where(eq(savedShelves.id, row.id)).get()) continue;
      tx.insert(savedShelves).values(row).run();
      summary.savedShelves.added++;
    }
    for (const row of t.searchHistory) {
      const here = tx.select().from(searchHistory).where(eq(searchHistory.key, row.key)).get();
      if (!here) {
        tx.insert(searchHistory).values(row).run();
        summary.searchHistory.added++;
      } else if (row.lastUsedAt > here.lastUsedAt || row.uses > here.uses) {
        tx.update(searchHistory)
          .set({ lastUsedAt: Math.max(row.lastUsedAt, here.lastUsedAt), uses: Math.max(row.uses, here.uses) })
          .where(eq(searchHistory.key, row.key))
          .run();
        summary.searchHistory.updated++;
      }
    }
    // Settings describe this Mac (its download folder): only fill in what isn't set here.
    for (const row of t.settings) {
      if (tx.select({ key: settings.key }).from(settings).where(eq(settings.key, row.key)).get()) continue;
      tx.insert(settings).values(row).run();
      summary.settings.added++;
    }
  });
  return summary;
}

export function backupFileName(at = new Date()): string {
  const d = at.toISOString().slice(0, 10);
  return `stacks-backup-${d}.json`;
}

/* ------------------------------- daily copies ------------------------------- */

export function backupDir(): string {
  return path.join(getSettings().downloadRoot, BACKUP_DIR_NAME);
}

export interface DailyBackups {
  dir: string;
  count: number;
  latest: number | null;
}

export function listDailyBackups(dir = backupDir()): DailyBackups {
  try {
    const files = fs.readdirSync(dir).filter((f) => /^stacks-backup-\d{4}-\d{2}-\d{2}\.json$/.test(f));
    const latest = files.length ? Math.max(...files.map((f) => fs.statSync(path.join(dir, f)).mtimeMs)) : null;
    return { dir, count: files.length, latest };
  } catch {
    return { dir, count: 0, latest: null };
  }
}

/** Writes today's copy if there isn't one yet, and keeps the newest 30. Returns the path written, if any. */
export function writeDailyBackup(dir = backupDir(), now = new Date()): string | null {
  const name = backupFileName(now);
  const target = path.join(dir, name);
  if (fs.existsSync(target)) return null;
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(createBackup()));
  fs.renameSync(tmp, target);
  const old = fs
    .readdirSync(dir)
    .filter((f) => /^stacks-backup-\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort()
    .reverse()
    .slice(KEEP_DAILY);
  for (const f of old) fs.rmSync(path.join(dir, f), { force: true });
  return target;
}

const globalForBackup = globalThis as unknown as { __stacksDailyBackup?: NodeJS.Timeout };

/** Checks every few hours while the server runs; writes at most one copy a day. */
export function startDailyBackups(): void {
  if (globalForBackup.__stacksDailyBackup) return;
  const tick = () => {
    try {
      writeDailyBackup();
    } catch {
      // Download folder unavailable (e.g. an unplugged drive): try again later.
    }
  };
  setTimeout(tick, 60_000).unref();
  globalForBackup.__stacksDailyBackup = setInterval(tick, 4 * 60 * 60 * 1000).unref();
}
