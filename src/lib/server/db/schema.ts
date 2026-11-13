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

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});
