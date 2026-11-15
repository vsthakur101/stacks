CREATE TABLE `reading_days` (
	`file` text NOT NULL,
	`day` text NOT NULL,
	`seconds` integer DEFAULT 0 NOT NULL,
	`pages` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`file`, `day`)
);
--> statement-breakpoint
CREATE INDEX `idx_reading_days_day` ON `reading_days` (`day`);