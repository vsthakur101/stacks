CREATE TABLE `annotations` (
	`id` text PRIMARY KEY NOT NULL,
	`file` text NOT NULL,
	`identifier` text,
	`page` integer NOT NULL,
	`kind` text NOT NULL,
	`rect_json` text,
	`color` text,
	`note` text,
	`text` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_annotations_file` ON `annotations` (`file`);--> statement-breakpoint
CREATE INDEX `idx_annotations_updated_at` ON `annotations` (`updated_at`);