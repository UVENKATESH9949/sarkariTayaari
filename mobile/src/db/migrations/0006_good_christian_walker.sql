CREATE TABLE `auth_session` (
	`key` text PRIMARY KEY NOT NULL,
	`token` text NOT NULL,
	`user_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`expires_at` integer
);
--> statement-breakpoint
ALTER TABLE `mock_test_attempts` ADD `is_synced` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_mock_test_attempts_is_synced` ON `mock_test_attempts` (`is_synced`);--> statement-breakpoint
ALTER TABLE `practice_sessions` ADD `is_synced` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_practice_sessions_is_synced` ON `practice_sessions` (`is_synced`);