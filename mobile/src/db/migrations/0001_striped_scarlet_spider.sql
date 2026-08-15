CREATE TABLE `bookmarks` (
	`question_id` text PRIMARY KEY NOT NULL,
	`question_text` text NOT NULL,
	`options` text NOT NULL,
	`correct_index` integer NOT NULL,
	`explanation` text NOT NULL,
	`subject_name` text NOT NULL,
	`topic_name` text NOT NULL,
	`exam_label` text NOT NULL,
	`bookmarked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `practice_session_results` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`question_id` text NOT NULL,
	`question_text` text NOT NULL,
	`options` text NOT NULL,
	`selected_index` integer NOT NULL,
	`correct_index` integer NOT NULL,
	`explanation` text NOT NULL,
	`is_correct` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `practice_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_practice_session_results_session_id` ON `practice_session_results` (`session_id`);--> statement-breakpoint
CREATE TABLE `practice_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`completed_at` integer NOT NULL,
	`exam_label` text NOT NULL,
	`subject_name` text NOT NULL,
	`topic_name` text NOT NULL,
	`level_label` text NOT NULL,
	`correct_count` integer NOT NULL,
	`total_count` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_practice_sessions_completed_at` ON `practice_sessions` (`completed_at`);