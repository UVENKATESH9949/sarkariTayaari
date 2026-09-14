-- TASK-2701 Phase 7.2 — hand-written, mirroring backend V44__mock_attempt_feedback.sql and
-- 0024_session_feedback.sql's identical pair of columns on practice_sessions. Two nullable
-- columns on mock_test_attempts: the AI-phrased narrative and when it was generated. Both
-- nullable, additive, no backfill needed (NULL is the correct value for every existing row —
-- nothing has ever generated feedback for a mock attempt before this migration).
ALTER TABLE `mock_test_attempts` ADD `feedback_narrative` text;
--> statement-breakpoint
ALTER TABLE `mock_test_attempts` ADD `feedback_generated_at` integer;
