CREATE TABLE `book_prefs` (
	`file` text PRIMARY KEY NOT NULL,
	`page_offset` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `book_text_pages` (
	`file` text NOT NULL,
	`page` integer NOT NULL,
	`text` text NOT NULL,
	`items_json` text NOT NULL,
	PRIMARY KEY(`file`, `page`)
);
--> statement-breakpoint
CREATE TABLE `book_texts` (
	`file` text PRIMARY KEY NOT NULL,
	`size` integer NOT NULL,
	`mtime_ms` integer NOT NULL,
	`pages` integer NOT NULL,
	`chars` integer NOT NULL,
	`median_chars` integer NOT NULL,
	`extracted_at` integer NOT NULL
);
