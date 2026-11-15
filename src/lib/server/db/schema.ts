import { index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
  /** When the owner last looked at what's new on this shelf (watch a search); null = since it was saved. */
  seenAt: integer('seen_at'),
});

/** Where the owner stopped in each downloaded file (Reader, Continue reading on Home). */
export const readingProgress = sqliteTable(
  'reading_progress',
  {
    /** Path inside the download folder. */
    file: text('file').primaryKey(),
    identifier: text('identifier'),
    title: text('title').notNull(),
    /** 1-based page for PDFs; for text and EPUB, position in thousandths. */
    page: integer('page').notNull(),
    total: integer('total').notNull(),
    /** Exact place where pages don't exist: an EPUB CFI. */
    position: text('position'),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('idx_reading_progress_updated_at').on(t.updatedAt)],
);

/** Highlights (boxes drawn on a page), bookmarks and page notes in downloaded files. */
export const annotations = sqliteTable(
  'annotations',
  {
    id: text('id').primaryKey(),
    /** Path inside the download folder. */
    file: text('file').notNull(),
    identifier: text('identifier'),
    page: integer('page').notNull(),
    kind: text('kind').notNull(), // highlight | bookmark | note
    /** Box as fractions of the page: {"x":0.1,"y":0.2,"w":0.5,"h":0.1}. Highlights only. */
    rectJson: text('rect_json'),
    color: text('color'),
    note: text('note'),
    /** Text found under the box when the page has a usable text layer. */
    text: text('text'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [index('idx_annotations_file').on(t.file), index('idx_annotations_updated_at').on(t.updatedAt)],
);

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** Text extracted once from a downloaded PDF (Find, page-number suggestions). Re-read when the file changes. */
export const bookTexts = sqliteTable('book_texts', {
  /** Path inside the download folder. */
  file: text('file').primaryKey(),
  size: integer('size').notNull(),
  mtimeMs: integer('mtime_ms').notNull(),
  pages: integer('pages').notNull(),
  chars: integer('chars').notNull(),
  /** Median characters per page: under ~200 means the scan has no real recognised text. */
  medianChars: integer('median_chars').notNull(),
  extractedAt: integer('extracted_at').notNull(),
});

export const bookTextPages = sqliteTable(
  'book_text_pages',
  {
    file: text('file').notNull(),
    page: integer('page').notNull(),
    /** NFC text of the page's items, joined by spaces. */
    text: text('text').notNull(),
    /** [[start, length, x, y, w, h], …]: each item's offset in `text` and its box as fractions of the page. */
    itemsJson: text('items_json').notNull(),
    /** `text` normalised for matching (no spaces, punctuation, nukta…): library-wide search with instr(). */
    norm: text('norm'),
  },
  (t) => [primaryKey({ columns: [t.file, t.page] })],
);

/** Per-book reading preferences. */
export const bookPrefs = sqliteTable('book_prefs', {
  file: text('file').primaryKey(),
  /** PDF page minus printed page number (e.g. 5 when PDF page 166 is printed page 161). */
  pageOffset: integer('page_offset'),
  updatedAt: integer('updated_at').notNull(),
});

/** Time spent reading, per file per day (Reading page). Counted only while the reader is visible and in use. */
export const readingDays = sqliteTable(
  'reading_days',
  {
    file: text('file').notNull(),
    /** Local date, YYYY-MM-DD. */
    day: text('day').notNull(),
    seconds: integer('seconds').notNull().default(0),
    /** New pages reached that day. */
    pages: integer('pages').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.file, t.day] }), index('idx_reading_days_day').on(t.day)],
);

/** The owner's own groups in the Library ("Puranas", "To read"). */
export const collections = sqliteTable('collections', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const collectionMembers = sqliteTable(
  'collection_members',
  {
    collectionId: text('collection_id')
      .notNull()
      .references(() => collections.id, { onDelete: 'cascade' }),
    /** "item:<archive identifier>" for Stacks items, "file:<path in download folder>" for other files. */
    ref: text('ref').notNull(),
    addedAt: integer('added_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.collectionId, t.ref] }), index('idx_collection_members_ref').on(t.ref)],
);

/** Files the owner put in the download folder, linked by hand to an archive.org item (no renaming). */
export const fileLinks = sqliteTable('file_links', {
  /** Path inside the download folder. */
  file: text('file').primaryKey(),
  identifier: text('identifier').notNull(),
  /** Name and size, to find the link again if the file is moved. */
  name: text('name').notNull(),
  size: integer('size').notNull(),
  linkedAt: integer('linked_at').notNull(),
});
