CREATE TABLE `exams` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`image_url` text,
	`display_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `followed_exams` (
	`exam_code` text PRIMARY KEY NOT NULL,
	`target_date` integer,
	`followed_at` integer NOT NULL,
	FOREIGN KEY (`exam_code`) REFERENCES `exams`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `languages` (
	`code` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `question_exams` (
	`question_id` text NOT NULL,
	`exam_code` text NOT NULL,
	PRIMARY KEY(`question_id`, `exam_code`),
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`exam_code`) REFERENCES `exams`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_question_exams_exam_code` ON `question_exams` (`exam_code`);--> statement-breakpoint
CREATE TABLE `question_translations` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`language_code` text NOT NULL,
	`question_text` text NOT NULL,
	`options` text NOT NULL,
	`explanation` text,
	FOREIGN KEY (`question_id`) REFERENCES `questions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`language_code`) REFERENCES `languages`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_question_translations_question_language` ON `question_translations` (`question_id`,`language_code`);--> statement-breakpoint
CREATE INDEX `idx_question_translations_question_id` ON `question_translations` (`question_id`);--> statement-breakpoint
CREATE TABLE `questions` (
	`id` text PRIMARY KEY NOT NULL,
	`correct_answer` text NOT NULL,
	`subject_id` text NOT NULL,
	`subject_name` text NOT NULL,
	`topic_id` text NOT NULL,
	`topic_name` text NOT NULL,
	`difficulty` text NOT NULL,
	`is_premium` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_questions_subject_id` ON `questions` (`subject_id`);--> statement-breakpoint
CREATE INDEX `idx_questions_topic_id` ON `questions` (`topic_id`);--> statement-breakpoint
CREATE INDEX `idx_questions_difficulty` ON `questions` (`difficulty`);--> statement-breakpoint
CREATE INDEX `idx_questions_updated_at` ON `questions` (`updated_at`);--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`last_synced_at` integer
);
--> statement-breakpoint
CREATE TABLE `topics` (
	`id` text PRIMARY KEY NOT NULL,
	`subject_id` text NOT NULL,
	`subject_name` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_topics_subject_id` ON `topics` (`subject_id`);