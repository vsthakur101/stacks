CREATE TABLE `download_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`format` text NOT NULL,
	`fallback` text NOT NULL,
	`item_count` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `download_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`seq` integer NOT NULL,
	`identifier` text NOT NULL,
	`item_json` text NOT NULL,
	`file_name` text,
	`format` text,
	`dest_path` text,
	`bytes_total` integer,
	`bytes_done` integer DEFAULT 0 NOT NULL,
	`md5` text,
	`state` text NOT NULL,
	`note` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `download_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_download_tasks_job_id` ON `download_tasks` (`job_id`);--> statement-breakpoint
CREATE INDEX `idx_download_tasks_state` ON `download_tasks` (`state`);--> statement-breakpoint
CREATE TABLE `http_cache` (
	`url` text PRIMARY KEY NOT NULL,
	`status` integer NOT NULL,
	`body` text NOT NULL,
	`fetched_at` integer NOT NULL,
	`ttl_s` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
