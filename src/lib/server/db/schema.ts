import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const httpCache = sqliteTable('http_cache', {
  url: text('url').primaryKey(),
  status: integer('status').notNull(),
  body: text('body').notNull(),
  fetchedAt: integer('fetched_at').notNull(),
  ttlS: integer('ttl_s').notNull(),
});

export const downloadJobs = sqliteTable('download_jobs', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
  format: text('format').notNull(),
  fallback: text('fallback').notNull(),
  itemCount: integer('item_count').notNull(),
});

export const downloadTasks = sqliteTable(
  'download_tasks',
  {
    id: text('id').primaryKey(),
    jobId: text('job_id')
      .notNull()
      .references(() => downloadJobs.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    identifier: text('identifier').notNull(),
    /** JSON-encoded TrayItem: the naming context captured at selection time. */
    itemJson: text('item_json').notNull(),
    fileName: text('file_name'),
    format: text('format'),
    destPath: text('dest_path'),
    bytesTotal: integer('bytes_total'),
    bytesDone: integer('bytes_done').notNull().default(0),
    md5: text('md5'),
    state: text('state').notNull(),
    note: text('note'),
    attempts: integer('attempts').notNull().default(0),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('idx_download_tasks_job_id').on(t.jobId), index('idx_download_tasks_state').on(t.state)],
);

/** One row per distinct search (path + params, page excluded). */
export const searchHistory = sqliteTable(
  'search_history',
  {
    key: text('key').primaryKey(),
    path: text('path').notNull(),
    paramsJson: text('params_json').notNull(),
    label: text('label').notNull(),
    lastUsedAt: integer('last_used_at').notNull(),
    uses: integer('uses').notNull().default(1),
  },
  (t) => [index('idx_search_history_last_used_at').on(t.lastUsedAt)],
);

/** Searches the owner pinned to Home as shelves. */
export const savedShelves = sqliteTable('saved_shelves', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  path: text('path').notNull(),
  paramsJson: text('params_json').notNull(),
  createdAt: integer('created_at').notNull(),
});

/** Where the owner stopped in each downloaded file (Reader, Continue reading on Home). */
export const readingProgress = sqliteTable(
  'reading_progress',
  {
    /** Path inside the download folder. */
    file: text('file').primaryKey(),
    identifier: text('identifier'),
    title: text('title').notNull(),
    /** 1-based page for PDFs; for text, scroll position in thousandths. */
    page: integer('page').notNull(),
    total: integer('total').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('idx_reading_progress_updated_at').on(t.updatedAt)],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
