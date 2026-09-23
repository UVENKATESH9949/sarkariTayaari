-- TASK-3501 — five daily task purposes instead of two.
--
-- NO SCHEMA CHANGE. `study_tasks.source` is a plain VARCHAR(20) with no CHECK constraint, by
-- V49's own design ("the vocabulary lives in Java as an enum ... a copy of it here is a copy that
-- can drift"), and topic_id / planned_question_count were already nullable. So WEAK_TOPIC,
-- STRENGTHEN and MISTAKE_REVIEW need nothing from the database at all.
--
-- WHAT THIS MIGRATION IS ACTUALLY FOR: one relabel.
--
-- 'PRACTICE' has always meant "new ground, from the roadmap" — the opposite half of 'REVISION'.
-- The five-purpose plan adds a category that genuinely is practice-for-strengthening, so leaving
-- the old value in place would mean a stored row's meaning depended on which day it was written:
--
--     a row written yesterday  : source='PRACTICE' means new ground
--     a row written tomorrow   : source='PRACTICE' would mean strengthening
--
-- In a table whose entire justification is being a faithful historical record of what the system
-- asked for (see V49's comment), that is the worst available option. Every existing 'PRACTICE' row
-- genuinely WAS a new-ground task, so renaming it to 'NEW_TOPIC' preserves its meaning exactly
-- rather than rewriting history — and the new vocabulary then has no ambiguous value in it.
--
-- Safe to run against live data: no index, constraint, view or query anywhere filters on `source`
-- (StudyTaskRepository keys on user/date/exam and on status; TaskOutcomeService never reads it),
-- and the column is already wide enough for every new value ('MISTAKE_REVIEW' is 14 characters).
UPDATE study_tasks SET source = 'NEW_TOPIC' WHERE source = 'PRACTICE';

COMMENT ON COLUMN study_tasks.source IS
    'Which learning purpose this task serves: NEW_TOPIC (ground not yet covered), REVISION (work '
    'done and fading, from the revision plan), WEAK_TOPIC (currently struggling, from the radar), '
    'STRENGTHEN (encountered but not yet strong) or MISTAKE_REVIEW (specific questions previously '
    'answered wrongly). Deliberately not a CHECK constraint — the vocabulary lives in Java, and a '
    'copy here is a copy that can drift.';
