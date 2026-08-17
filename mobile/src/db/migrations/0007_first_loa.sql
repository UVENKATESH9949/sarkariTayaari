ALTER TABLE `bookmarks` ADD `is_deleted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `is_synced` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `bookmarks` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE `bookmarks` SET `updated_at` = `bookmarked_at`, `is_synced` = 0;