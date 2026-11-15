CREATE TABLE `file_links` (
	`file` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`name` text NOT NULL,
	`size` integer NOT NULL,
	`linked_at` integer NOT NULL
);
