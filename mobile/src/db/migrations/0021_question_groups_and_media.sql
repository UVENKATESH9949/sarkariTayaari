-- Multi-type question architecture, Phase P3 (TASK-2301): shared content. Mirrors backend
-- migration V29. Hand-written, not `drizzle-kit generate` output, per this project's own
-- standing rule (see 0018's comment).
--
-- Every statement here is additive (new tables, new nullable columns on an existing one) --
-- no existing row is touched, so this migration is safe to run against a populated
-- pre-existing database with zero data loss, the same bar 0018/0020 were held to.

CREATE TABLE `question_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`group_type` text NOT NULL,
	`updated_at` integer NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL
);--> statement-breakpoint

CREATE TABLE `question_group_translations` (
	`id` text PRIMARY KEY NOT NULL,
	`question_group_id` text NOT NULL,
	`language_code` text NOT NULL,
	`passage_text` text,
	FOREIGN KEY (`question_group_id`) REFERENCES `question_groups`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`language_code`) REFERENCES `languages`(`code`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_question_group_translations_group_language` ON `question_group_translations` (`question_group_id`,`language_code`);--> statement-breakpoint

CREATE TABLE `question_media` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text,
	`question_group_id` text,
	`media_type` text NOT NULL,
	`url` text NOT NULL,
	`mime_type` text,
	`display_order` integer DEFAULT 0 NOT NULL,
	`updated_at` integer NOT NULL,
	`is_deleted` integer DEFAULT false NOT NULL,
	`local_uri` text,
	`downloaded_at` integer
);--> statement-breakpoint
CREATE INDEX `idx_question_media_question_id` ON `question_media` (`question_id`);--> statement-breakpoint
CREATE INDEX `idx_question_media_question_group_id` ON `question_media` (`question_group_id`);--> statement-breakpoint

-- Nullable, no default needed — every existing question is standalone (question_group_id
-- NULL) and stays that way until an admin actually authors grouped content.
ALTER TABLE `questions` ADD `question_group_id` text;--> statement-breakpoint
ALTER TABLE `questions` ADD `group_order` integer;--> statement-breakpoint
CREATE INDEX `idx_questions_question_group_id` ON `questions` (`question_group_id`);
