--> HAND-EDITED: every statement below carries IF EXISTS / IF NOT EXISTS, which
--> drizzle-kit does not generate. This migration only adds and removes indexes, so it is
--> naturally idempotent — but a bare `DROP INDEX` on an absent index (or a bare
--> `CREATE INDEX` on a present one) aborts the whole migration, and a failed migration is
--> a hard gate in app/_layout.tsx: the app renders "Database migration failed" and cannot
--> start. Index DDL is exactly the case where being defensive costs nothing.
--> Same class of hand-edit as the one recorded in reports/06-bookmark-sync-and-offline-indicator/.
--> Found the hard way: a bare DROP INDEX here did brick the app on the test emulator.
DROP INDEX IF EXISTS `idx_question_translations_question_id`;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_bookmarks_is_deleted_is_synced` ON `bookmarks` (`is_deleted`,`is_synced`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_bookmarks_is_synced` ON `bookmarks` (`is_synced`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_mock_test_attempts_exam_code` ON `mock_test_attempts` (`exam_code`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_questions_topic_difficulty_deleted` ON `questions` (`topic_id`,`difficulty`,`is_deleted`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_questions_subject_deleted` ON `questions` (`subject_id`,`is_deleted`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_subjects_name` ON `subjects` (`name`);
