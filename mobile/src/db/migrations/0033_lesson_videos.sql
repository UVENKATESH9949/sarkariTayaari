-- AI Video foundation — the on-device video cache. Hand-written, not drizzle-kit output, for the
-- reason 0021/0022 already record: drizzle-kit has emitted an unguarded CREATE here before and a
-- failed migration is a hard gate that stops the app starting.
--
-- This table is a CACHE, not synced reference content. Nothing writes it during reference sync;
-- a row appears only when a student actually asks about a video. That is deliberate: shipping
-- metadata for every video to every device would make people who never watch one pay for them,
-- which is the opposite of what this product wants on a slow connection.
--
-- The cache key is (video_id, content_version). A corrected video arrives as a new
-- content_version, so a device holding the old file can tell it is stale rather than playing a
-- superseded lesson forever. local_uri/downloaded_at mirror question_media's local-only columns
-- exactly, including the rule that an upsert must never blank them — see writeQuestions.ts.
CREATE TABLE IF NOT EXISTS `lesson_videos` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_kind` text NOT NULL,
	`owner_id` text NOT NULL,
	`resolved_via` text,
	`language_code` text NOT NULL,
	`teaching_level` text DEFAULT 'STANDARD' NOT NULL,
	`quality` text DEFAULT 'STANDARD' NOT NULL,
	`content_version` integer DEFAULT 1 NOT NULL,
	`status` text NOT NULL,
	`duration_seconds` integer,
	`size_bytes` integer,
	`checksum_sha256` text,
	`requires_premium` integer DEFAULT false NOT NULL,
	`playback_path` text,
	`local_uri` text,
	`downloaded_at` integer,
	`checked_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_lesson_videos_owner` ON `lesson_videos` (`owner_kind`,`owner_id`,`language_code`);
