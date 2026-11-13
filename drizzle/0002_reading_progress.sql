CREATE TABLE `reading_progress` (
	`file` text PRIMARY KEY NOT NULL,
	`identifier` text,
	`title` text NOT NULL,
	`page` integer NOT NULL,
	`total` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_reading_progress_updated_at` ON `reading_progress` (`updated_at`);