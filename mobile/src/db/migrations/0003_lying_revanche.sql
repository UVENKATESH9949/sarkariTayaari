CREATE TABLE `difficulty_levels` (
	`code` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`color` text,
	`color_bg` text,
	`icon` text
);
--> statement-breakpoint
CREATE TABLE `exam_papers` (
	`id` text PRIMARY KEY NOT NULL,
	`stage_id` text NOT NULL,
	`exam_code` text NOT NULL,
	`name` text NOT NULL,
	`paper_type` text NOT NULL,
	`is_mockable` integer DEFAULT false NOT NULL,
	`duration_minutes` integer,
	`total_marks` real,
	`marks_correct` real,
	`marks_wrong` real,
	`is_qualifying` integer DEFAULT false NOT NULL,
	`qualifying_percentage` real,
	`display_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`stage_id`) REFERENCES `exam_stages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_exam_papers_stage_id` ON `exam_papers` (`stage_id`);--> statement-breakpoint
CREATE INDEX `idx_exam_papers_exam_code` ON `exam_papers` (`exam_code`);--> statement-breakpoint
CREATE TABLE `exam_stages` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_code` text NOT NULL,
	`name` text NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`effective_from` text,
	`version_label` text,
	FOREIGN KEY (`exam_code`) REFERENCES `exams`(`code`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_exam_stages_exam_code` ON `exam_stages` (`exam_code`);--> statement-breakpoint
CREATE TABLE `paper_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`paper_id` text NOT NULL,
	`name` text NOT NULL,
	`question_count` integer DEFAULT 0 NOT NULL,
	`duration_minutes` integer,
	`is_sectionally_timed` integer DEFAULT false NOT NULL,
	`marks_correct` real,
	`marks_wrong` real,
	`display_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`paper_id`) REFERENCES `exam_papers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_paper_sections_paper_id` ON `paper_sections` (`paper_id`);--> statement-breakpoint
CREATE TABLE `paper_types` (
	`code` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`mockable` integer DEFAULT false NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `section_subjects` (
	`section_id` text NOT NULL,
	`subject_id` text NOT NULL,
	PRIMARY KEY(`section_id`, `subject_id`),
	FOREIGN KEY (`section_id`) REFERENCES `paper_sections`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_section_subjects_subject_id` ON `section_subjects` (`subject_id`);--> statement-breakpoint
ALTER TABLE `subjects` ADD `display_order` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `subjects` ADD `icon` text;--> statement-breakpoint
ALTER TABLE `subjects` ADD `color` text;--> statement-breakpoint
ALTER TABLE `subjects` ADD `color_bg` text;--> statement-breakpoint
ALTER TABLE `topics` ADD `display_order` integer DEFAULT 0 NOT NULL;