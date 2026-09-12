-- TASK-2701 Phase 3 -- local cache for AI-generated question/topic explanations, synced from
-- GET /api/ai-content/sync via writeReferenceData(), the same way exam_guide_* content is.
--
-- Hand-written, following 0018's own documented lesson: drizzle-kit's generator has emitted a
-- full CREATE TABLE for an already-existing table before (its snapshot state doesn't track
-- this schema's real hand-maintained migration history), and its index DDL carries no
-- existence guards -- a bare CREATE/DROP INDEX bricked the app outright once, since a failed
-- migration is a hard startup gate in _layout.tsx. This is a brand-new table, so there is no
-- populated-row risk here, but the guarded IF NOT EXISTS forms are used throughout anyway to
-- stay consistent with every other CREATE in this migration history.
CREATE TABLE IF NOT EXISTS `ai_content` (
	`id` text PRIMARY KEY NOT NULL,
	`task_id` text NOT NULL,
	`subject_id` text NOT NULL,
	`language_code` text NOT NULL,
	`published` integer DEFAULT false NOT NULL,
	`payload_json` text,
	`updated_at` integer NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_ai_content_subject_id` ON `ai_content` (`subject_id`);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_ai_content_key` ON `ai_content` (`task_id`,`subject_id`,`language_code`);
