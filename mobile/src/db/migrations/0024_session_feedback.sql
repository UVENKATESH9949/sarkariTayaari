-- TASK-2701 Phase 7.1 — hand-written, mirroring backend V43__session_feedback.sql. Two
-- nullable columns on practice_sessions: the AI-phrased narrative and when it was
-- generated. Both nullable, additive, no backfill needed (NULL is the correct value for
-- every existing row — nothing has ever generated feedback before this migration).
ALTER TABLE `practice_sessions` ADD `feedback_narrative` text;
--> statement-breakpoint
ALTER TABLE `practice_sessions` ADD `feedback_generated_at` integer;
