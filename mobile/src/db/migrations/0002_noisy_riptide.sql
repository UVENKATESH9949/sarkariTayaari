CREATE TABLE `mock_test_attempt_results` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`subject_name` text NOT NULL,
	`question_id` text NOT NULL,
	`question_text` text NOT NULL,
	`options` text NOT NULL,
	`selected_index` integer,
	`correct_index` integer NOT NULL,
	`explanation` text NOT NULL,
	`marked_for_review` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`attempt_id`) REFERENCES `mock_test_attempts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_mock_test_attempt_results_attempt_id` ON `mock_test_attempt_results` (`attempt_id`);--> statement-breakpoint
CREATE TABLE `mock_test_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_code` text NOT NULL,
	`exam_label` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer NOT NULL,
	`duration_seconds` integer NOT NULL,
	`time_taken_seconds` integer NOT NULL,
	`marks_correct` real NOT NULL,
	`marks_wrong` real NOT NULL,
	`total_marks_scored` real NOT NULL,
	`correct_count` integer NOT NULL,
	`wrong_count` integer NOT NULL,
	`unattempted_count` integer NOT NULL,
	`total_questions` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_mock_test_attempts_completed_at` ON `mock_test_attempts` (`completed_at`);