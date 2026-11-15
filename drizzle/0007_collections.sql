CREATE TABLE `collection_members` (
	`collection_id` text NOT NULL,
	`ref` text NOT NULL,
	`added_at` integer NOT NULL,
	PRIMARY KEY(`collection_id`, `ref`),
	FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_collection_members_ref` ON `collection_members` (`ref`);--> statement-breakpoint
CREATE TABLE `collections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
