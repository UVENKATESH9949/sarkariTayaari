--> HAND-EDITED, same convention as 0011/0012/0013: every CREATE carries IF NOT EXISTS,
--> which drizzle-kit does not generate. A failed migration is a hard gate in
--> app/_layout.tsx, so table DDL is guarded wherever SQLite allows it. This migration is
--> pure CREATE TABLE (no ALTER), so it has no unguardable statement at all.
-->
--> Exam Guide spec §44 "Offline loading / caching" — Phase 1 shipped this feature
--> live-fetch-only (see mobile/src/api/examGuide.ts's own comment), the one reference-data
--> type in this app with no local table. These tables mirror the backend's combined
--> ExamGuideResponse and are written by writeExamGuides() in sync/writeQuestions.ts,
--> during the ordinary reference-data sync pass.
-->
--> Every child table is keyed by exam_code, not the backend's recruitment_cycle_id: only
--> each exam's CURRENT, published cycle is ever synced (never history), so there is
--> exactly one cycle per exam locally — which is what makes a wholesale delete+reinsert on
--> every sync safe, the same pattern exam_stages/exam_papers/paper_sections already use.
CREATE TABLE IF NOT EXISTS `exam_guide_cycles` (
	`exam_code` text PRIMARY KEY NOT NULL REFERENCES `exams`(`code`),
	`recruitment_cycle_id` text NOT NULL,
	`exam_name` text NOT NULL,
	`cycle_name` text NOT NULL,
	`status` text NOT NULL,
	`notification_date` text,
	`application_start` text,
	`application_end` text,
	`exam_start` text,
	`exam_end` text,
	`vacancy_count` integer,
	`notification_url` text,
	`is_demo` integer DEFAULT false NOT NULL,
	`last_verified_at` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `exam_guide_eligibility` (
	`exam_code` text PRIMARY KEY NOT NULL REFERENCES `exam_guide_cycles`(`exam_code`),
	`minimum_age` integer,
	`maximum_age` integer,
	`age_cutoff_date` text,
	`qualification` text,
	`nationality` text,
	`gender_requirement` text,
	`category_relaxation` text,
	`special_requirements` text,
	`source_id` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `exam_guide_dates` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_code` text NOT NULL REFERENCES `exam_guide_cycles`(`exam_code`),
	`event_type` text NOT NULL,
	`title` text NOT NULL,
	`start_date` text,
	`end_date` text,
	`official` integer DEFAULT false NOT NULL,
	`source_id` text,
	`display_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_exam_guide_dates_exam_code` ON `exam_guide_dates` (`exam_code`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `exam_guide_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_code` text NOT NULL REFERENCES `exam_guide_cycles`(`exam_code`),
	`document_name` text NOT NULL,
	`required` text NOT NULL,
	`applicable_for` text,
	`format` text,
	`max_size_kb` integer,
	`dimensions` text,
	`instructions` text,
	`user_status` text,
	`source_id` text,
	`display_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_exam_guide_documents_exam_code` ON `exam_guide_documents` (`exam_code`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `exam_guide_steps` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_code` text NOT NULL REFERENCES `exam_guide_cycles`(`exam_code`),
	`step_number` integer NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`warning` text,
	`official_url` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_exam_guide_steps_exam_code` ON `exam_guide_steps` (`exam_code`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `exam_guide_mistakes` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_code` text NOT NULL REFERENCES `exam_guide_cycles`(`exam_code`),
	`mistake` text NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_exam_guide_mistakes_exam_code` ON `exam_guide_mistakes` (`exam_code`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `exam_guide_fees` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_code` text NOT NULL REFERENCES `exam_guide_cycles`(`exam_code`),
	`category` text NOT NULL,
	`amount_rupees` integer DEFAULT 0 NOT NULL,
	`exempted` integer DEFAULT false NOT NULL,
	`notes` text,
	`source_id` text,
	`display_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_exam_guide_fees_exam_code` ON `exam_guide_fees` (`exam_code`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `exam_guide_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`source_name` text NOT NULL,
	`source_type` text NOT NULL,
	`url` text
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `exam_guide_career_posts` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_code` text NOT NULL REFERENCES `exam_guide_cycles`(`exam_code`),
	`post_title` text NOT NULL,
	`pay_level` text,
	`salary_min_rupees` integer,
	`salary_max_rupees` integer,
	`growth_path` text,
	`description` text,
	`source_id` text,
	`display_order` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_exam_guide_career_posts_exam_code` ON `exam_guide_career_posts` (`exam_code`);
