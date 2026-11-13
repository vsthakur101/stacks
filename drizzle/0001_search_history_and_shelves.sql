CREATE TABLE `saved_shelves` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`path` text NOT NULL,
	`params_json` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `search_history` (
	`key` text PRIMARY KEY NOT NULL,
	`path` text NOT NULL,
	`params_json` text NOT NULL,
	`label` text NOT NULL,
	`last_used_at` integer NOT NULL,
	`uses` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_search_history_last_used_at` ON `search_history` (`last_used_at`);