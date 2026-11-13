import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import fs from 'node:fs';
import path from 'node:path';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;

interface DbHandle {
  db: Db;
  sqlite: Database.Database;
}

const globalForDb = globalThis as unknown as { __stacksDb?: DbHandle };

/** Opens (or reuses) a database at `file`. ':memory:' is supported for tests. */
export function openDb(file: string): DbHandle {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
  return { db, sqlite };
}

/** Set once per evaluation of this module, so a dev-mode reload re-applies any new migrations. */
let migratedThisLoad = false;

/** Process-wide singleton, pinned on globalThis so dev-mode module reloads don't open a second handle. */
export function getDb(): Db {
  if (!globalForDb.__stacksDb) {
    const file = process.env.STACKS_DB ?? path.join(process.cwd(), 'data', 'stacks.db');
    globalForDb.__stacksDb = openDb(file);
    migratedThisLoad = true;
  } else if (!migratedThisLoad) {
    // The handle outlived a code reload; bring its schema up to date (idempotent, cheap).
    migrate(globalForDb.__stacksDb.db, { migrationsFolder: path.join(process.cwd(), 'drizzle') });
    migratedThisLoad = true;
  }
  return globalForDb.__stacksDb.db;
}

/** Test hook: swap the singleton. */
export function setDbForTests(handle: DbHandle | undefined): void {
  globalForDb.__stacksDb = handle;
}
