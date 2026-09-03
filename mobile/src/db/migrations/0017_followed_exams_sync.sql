-- Hand-written, same convention as 0007 (which did this exact thing for `bookmarks`):
-- SQLite has no `ADD COLUMN IF NOT EXISTS`, and `updated_at NOT NULL` with no default
-- would fail outright on any device with existing followed_exams rows. Backfills
-- updated_at from the existing followed_at and marks pre-existing rows unsynced so
-- they upload on the very next sync, exactly like 0007 did for bookmarks.
ALTER TABLE `followed_exams` ADD `is_deleted` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `followed_exams` ADD `is_synced` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `followed_exams` ADD `updated_at` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_followed_exams_is_synced` ON `followed_exams` (`is_synced`);--> statement-breakpoint
UPDATE `followed_exams` SET `updated_at` = `followed_at`, `is_synced` = 0;
