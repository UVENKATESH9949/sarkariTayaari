-- TASK-2701 Phase 7.2 -- caches a generated SESSION_FEEDBACK narrative on the mock attempt row
-- it was generated for, mirroring V43__session_feedback.sql's identical columns on
-- user_practice_sessions. Additive and nullable: every existing row gets NULL, meaning "no
-- narrative generated yet" -- never a required backfill. Persistence here is opportunistic, the
-- same reasoning PersonalNarrativeService's own doc comment gives for Practice -- the primary,
-- always-available copy lives on the device itself (mobile schema.ts's matching nullable
-- columns on mock_test_attempts).
ALTER TABLE user_mock_attempts
    ADD COLUMN feedback_narrative TEXT,
    ADD COLUMN feedback_generated_at TIMESTAMPTZ;
