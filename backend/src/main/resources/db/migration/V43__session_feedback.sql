-- TASK-2701 Phase 7.1 -- caches a generated SESSION_FEEDBACK narrative on the session row it was
-- generated for, so reopening the same session's Summary screen does not re-generate (and
-- re-bill a real model call) for a result that will never change. Additive and nullable: every
-- existing row gets NULL, meaning "no narrative generated yet" -- never a required backfill.
-- Persistence here is opportunistic (see PersonalNarrativeService's own doc comment) -- the
-- primary, always-available copy lives on the device itself (mobile schema.ts's own matching
-- nullable columns), since a session's Summary screen can ask for feedback before the session
-- has necessarily synced to this table at all.
ALTER TABLE user_practice_sessions
    ADD COLUMN feedback_narrative TEXT,
    ADD COLUMN feedback_generated_at TIMESTAMPTZ;
