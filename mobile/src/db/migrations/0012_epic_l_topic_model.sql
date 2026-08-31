--> HAND-EDITED: every CREATE below carries IF NOT EXISTS, which drizzle-kit does not
--> generate. Same class of edit as migration 0011, and for the same hard-won reason: a failed
--> migration is a hard gate in app/_layout.tsx — the app renders "Database migration failed"
--> and cannot start at all. A bare DROP INDEX in 0011 did exactly that on the test emulator.
--> Table and index DDL is precisely the case where being defensive costs nothing.
-->
--> KNOWN GAP, stated rather than hidden: SQLite has no `ALTER TABLE ... ADD COLUMN IF NOT
--> EXISTS`, so the five ADD COLUMN statements at the bottom cannot be guarded. They are last
--> on purpose — everything guardable is already committed by the time they run — but if one of
--> them fails partway, this migration is not marked applied and a retry will fail on the
--> column that did succeed. Recovering from that means clearing app data, so these five
--> statements are the risky part of this file and were reviewed as such. There is no SQL-level
--> fix available; the alternative would be a JS pre-check against pragma table_info, which
--> drizzle's migrator has no hook for.

--> Epic L / TICKET-2101 + 2106 + 2107 — the per-exam topic map with computed trend and priority.
CREATE TABLE IF NOT EXISTS `exam_topic_intelligence` (
	`exam_code` text NOT NULL,
	`topic_id` text NOT NULL,
	`curated_weightage_percent` real,
	`computed_weightage_percent` real,
	`appearance_count` integer DEFAULT 0 NOT NULL,
	`window_from_year` integer,
	`window_to_year` integer,
	`trend_direction` text,
	`trend_score` real,
	`system_priority` real,
	`admin_override` real,
	`final_priority` real,
	`algorithm_version` text,
	PRIMARY KEY(`exam_code`, `topic_id`),
	FOREIGN KEY (`exam_code`) REFERENCES `exams`(`code`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_exam_topic_intelligence_priority` ON `exam_topic_intelligence` (`exam_code`,`final_priority`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_exam_topic_intelligence_topic` ON `exam_topic_intelligence` (`topic_id`);--> statement-breakpoint

--> Epic L / TICKET-2103 — the prerequisite DAG.
--> No FK on prerequisite_topic_id, matching what drizzle generated from the schema: the column
--> points at topics.id, but a device mid-sync can legitimately hold an edge whose target row
--> has not been written yet, and an FK here would turn that ordinary race into a failed
--> migration or a rejected insert. The server owns this invariant.
CREATE TABLE IF NOT EXISTS `topic_prerequisites` (
	`topic_id` text NOT NULL,
	`prerequisite_topic_id` text NOT NULL,
	PRIMARY KEY(`topic_id`, `prerequisite_topic_id`),
	FOREIGN KEY (`topic_id`) REFERENCES `topics`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_topic_prerequisites_prerequisite` ON `topic_prerequisites` (`prerequisite_topic_id`);--> statement-breakpoint

--> Epic L / TICKET-2105 — this device's per-topic mastery, synced last-write-wins.
CREATE TABLE IF NOT EXISTS `topic_progress` (
	`topic_id` text PRIMARY KEY NOT NULL,
	`state` text DEFAULT 'NOT_STARTED' NOT NULL,
	`accuracy_percent` real,
	`attempted_count` integer DEFAULT 0 NOT NULL,
	`correct_count` integer DEFAULT 0 NOT NULL,
	`total_time_ms` integer DEFAULT 0 NOT NULL,
	`last_practiced_at` integer,
	`is_synced` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_topic_progress_is_synced` ON `topic_progress` (`is_synced`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_topic_progress_accuracy` ON `topic_progress` (`accuracy_percent`);--> statement-breakpoint

--> Epic L / TICKET-2104 — PYQ provenance on the question itself, for the badge in the quiz.
ALTER TABLE `questions` ADD `is_pyq` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `questions` ADD `pyq_year` integer;--> statement-breakpoint
ALTER TABLE `questions` ADD `pyq_shift` text;--> statement-breakpoint

--> Epic L / TICKET-2102 — topic hierarchy depth. parent_name is denormalized so a list can
--> render "Arithmetic → Percentage" without a self-join per row.
ALTER TABLE `topics` ADD `parent_id` text;--> statement-breakpoint
ALTER TABLE `topics` ADD `parent_name` text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_topics_parent_id` ON `topics` (`parent_id`);
