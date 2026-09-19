-- TASK-2801 — behavioural data foundation: capture completeness + immutable classification.
--
-- Additive only. No new table: user_practice_session_results and user_mock_attempt_results
-- (V6, extended by V24's time_ms and V26's response model) ALREADY are the per-question event
-- log this milestone is about, so a parallel "question_attempts" table would duplicate live
-- data rather than add anything. What was actually missing is narrower, and is all here.

-- ------------------------------------------------- 1. Practice sessions lose their timing
-- The device has recorded a practice session's exam code, elapsed duration and offered-question
-- count since Doc 2 §7, and every one of them was LOCAL-ONLY: absent from ProgressDtos, from the
-- sync payload, and from this table. So they never reached the server and were lost outright on
-- a device change, and "how long did this student actually study" was unanswerable server-side —
-- for practice only; user_mock_attempts has carried started_at/duration_seconds since V6.
--
-- All nullable. Every existing row legitimately has no value, and so does every row uploaded by
-- a client built before this release. NULL means "not recorded", never zero — the same rule
-- V24's time_ms established, and for the same reason: a zero here would claim an instant
-- session and drag every average derived from it.
ALTER TABLE user_practice_sessions ADD COLUMN started_at      TIMESTAMPTZ;
ALTER TABLE user_practice_sessions ADD COLUMN duration_ms     BIGINT;
ALTER TABLE user_practice_sessions ADD COLUMN available_count INT;
ALTER TABLE user_practice_sessions ADD COLUMN exam_code       VARCHAR(30);

-- No FK on exam_code, deliberately. It is a historical record of what the student was practising
-- for, and it must survive an exam being renamed or retired — the same reasoning that keeps
-- exam_label/subject_name/topic_name as plain strings on this table. It is also NULL for the
-- "All Government Exams" shortcut, which genuinely spans every exam at once.

-- ------------------------------- 2. Classification snapshot: what it WAS when they answered
-- Topic, subject, difficulty and PYQ status are not on the attempt today — every reader joins
-- `questions` through question_id (TopicEvidenceRepository does exactly this, and so does
-- mobile's localEvidence.ts). That join reads whatever the question says *now*.
--
-- Which means re-tagging a question in the admin console silently rewrites history. A student
-- who answered 40 Percentage questions last year becomes a student who answered 40 Profit &
-- Loss questions, retroactively, and every trend computed over that window moves for a reason
-- that has nothing to do with the student. For a personalization engine reading these rows as
-- evidence, that is not a rounding error.
--
-- So the four analytics-relevant classifiers are frozen onto the attempt. question_id stays the
-- canonical reference to the question itself — this is a snapshot of its classification, not a
-- copy of the question.
--
-- IDs, not names: a topic rename must not fragment a student's history into two topics that are
-- really one. difficulty_code matches difficulty_levels.code (VARCHAR(20), the FK target since
-- V3), which is already a stable code rather than a display label.
--
-- No foreign keys, for the same reason question_id has none since V6: history has to outlive the
-- content it refers to. A hard-deleted topic leaves the id behind rather than erasing the fact
-- that the student answered something classified that way.
ALTER TABLE user_practice_session_results ADD COLUMN topic_id        UUID;
ALTER TABLE user_practice_session_results ADD COLUMN subject_id      UUID;
ALTER TABLE user_practice_session_results ADD COLUMN difficulty_code VARCHAR(20);
ALTER TABLE user_practice_session_results ADD COLUMN is_pyq          BOOLEAN;

ALTER TABLE user_mock_attempt_results ADD COLUMN topic_id        UUID;
ALTER TABLE user_mock_attempt_results ADD COLUMN subject_id      UUID;
ALTER TABLE user_mock_attempt_results ADD COLUMN difficulty_code VARCHAR(20);
ALTER TABLE user_mock_attempt_results ADD COLUMN is_pyq          BOOLEAN;

-- Backfill from the current classification. This is the best available truth for history: it is
-- what every existing reader has been computing on the fly anyway, so nothing changes meaning
-- today — it is simply frozen from here on instead of drifting with future content edits.
--
-- `questions` carries no subject_id of its own (V2 moved subject onto `topics`), so subject comes
-- through the topic join. A row whose question has since been hard-deleted matches nothing and
-- keeps four NULLs — correct, and exactly what an analytics reader must render as unknown rather
-- than as a zero or an "Other" bucket.
UPDATE user_practice_session_results r
SET topic_id        = q.topic_id,
    subject_id      = t.subject_id,
    difficulty_code = q.difficulty,
    is_pyq          = q.is_pyq
FROM questions q
JOIN topics t ON t.id = q.topic_id
WHERE q.id = r.question_id
  AND r.topic_id IS NULL;

UPDATE user_mock_attempt_results r
SET topic_id        = q.topic_id,
    subject_id      = t.subject_id,
    difficulty_code = q.difficulty,
    is_pyq          = q.is_pyq
FROM questions q
JOIN topics t ON t.id = q.topic_id
WHERE q.id = r.question_id
  AND r.topic_id IS NULL;

-- ----------------------------------------------------------------------------- 3. Indexes
-- Every analytics read is "this student's attempts, grouped by one classifier". The user bound
-- is already served by idx_user_practice_sessions_user / idx_user_mock_attempts_user
-- (user_id, completed_at DESC) on the parent tables, which is also what makes the activity,
-- streak and time-window queries cheap — nothing new is needed for those.
--
-- These cover the grouping side, and the question-id lookups the mistake-analysis and
-- duplicate-detection paths already do row by row.
CREATE INDEX idx_practice_results_question ON user_practice_session_results (question_id);
CREATE INDEX idx_mock_results_question     ON user_mock_attempt_results (question_id);
CREATE INDEX idx_practice_results_topic    ON user_practice_session_results (topic_id);
CREATE INDEX idx_mock_results_topic        ON user_mock_attempt_results (topic_id);
CREATE INDEX idx_practice_results_subject  ON user_practice_session_results (subject_id);
CREATE INDEX idx_mock_results_subject      ON user_mock_attempt_results (subject_id);

-- Deliberately NOT in this migration, and deliberately not tables at all:
--
--   * No user_personalization / user_streak / user_study_summary / user_topic_trend table.
--     Every figure they would hold is derivable from the rows above, and storing a derived value
--     makes it the thing that can be wrong. A streak is DISTINCT date(completed_at) over an
--     already-indexed column; a trend is two time windows compared. user_topic_health (V24) is
--     the pattern to follow if one of these ever genuinely needs caching: a rebuildable,
--     algorithm-versioned cache that can be dropped wholesale without losing anything.
--
--   * No source_type column yet. Diagnostic tests are a real third source with no server
--     representation at all (mobile's diagnostic_attempts is local-only and stores only a
--     per-topic JSON summary, no per-question rows), so making them first-class is a client
--     change, not a column — and it waits until this capture layer is stable.
--
--   * No retention or partitioning. At roughly 50 answers/day/student this reaches ~180M result
--     rows a year at 10k DAU. Postgres is comfortable there and nothing prunes it, the same
--     position ai_usage_events (V46) documents for itself. Worth deciding before that scale,
--     not before.
