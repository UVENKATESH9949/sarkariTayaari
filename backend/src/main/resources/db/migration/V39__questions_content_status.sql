-- TASK-2501 Phase 2 (section Q). Reuses the existing ContentStatus enum (DRAFT/REVIEW/
-- PUBLISHED) Exam Guide already introduced for recruitment_cycles -- the same "is this fact
-- ready for students to see" question, just asked of a question instead of a cycle.
--
-- Every existing row (and everything QuestionService.create()/bulkImport() go on producing,
-- unchanged) defaults to PUBLISHED explicitly, at the schema level -- not left to a
-- follow-up script to remember. V18's own Exam Guide migration already taught this lesson
-- the hard way once: its demo seeder built cycles directly, bypassing the DTO default, and
-- would have silently vanished from every public read the moment that migration ran, had it
-- not been caught before shipping. Only the new question-ingestion Accept path (Phase 2)
-- ever sets DRAFT.

ALTER TABLE questions ADD COLUMN content_status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED';

CREATE INDEX idx_questions_content_status ON questions (content_status);
