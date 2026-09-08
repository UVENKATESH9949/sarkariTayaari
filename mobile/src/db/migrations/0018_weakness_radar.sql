-- Weakness Radar v1 (tasks/TASK-2201-weakness-radar.md).
--
-- Hand-written rather than taken from `drizzle-kit generate`, on this project's own
-- experience: the generator produced a full CREATE TABLE for every already-existing
-- exam_guide_* table when the local cache column was added (its snapshot state does not match
-- this schema's real migration history), and it emits index DDL with no existence guards --
-- a bare DROP/CREATE INDEX bricked the app outright once, because a failed migration is a
-- hard startup gate in _layout.tsx.
--
-- The two ADD COLUMNs are the unguardable part: SQLite has no `ADD COLUMN IF NOT EXISTS`.
-- Both are nullable with no default, which is the safe shape -- they cannot fail on a
-- populated table the way 0017's `NOT NULL` columns would have without their backfill, and
-- every existing row correctly ends up with NULL, meaning "no time was recorded", not zero.
ALTER TABLE `practice_session_results` ADD `time_ms` integer;--> statement-breakpoint
ALTER TABLE `mock_test_attempt_results` ADD `time_ms` integer;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `radar_cache` (
	`exam_code` text PRIMARY KEY NOT NULL,
	`algorithm_version` text NOT NULL,
	`computed_at` integer,
	`fetched_at` integer NOT NULL,
	`payload_json` text NOT NULL
);
