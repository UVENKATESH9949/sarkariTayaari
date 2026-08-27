CREATE TABLE `exam_badges` (
	`code` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`color` text,
	`color_bg` text
);
--> statement-breakpoint
ALTER TABLE `exams` ADD `difficulty` text;--> statement-breakpoint
ALTER TABLE `exams` ADD `badge` text;