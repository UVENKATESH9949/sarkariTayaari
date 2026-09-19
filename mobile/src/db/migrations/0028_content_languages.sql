-- Content-language preferences: which languages this student wants their QUESTIONS in.
--
-- A table rather than a column on `app_preferences`, which is where every other device
-- preference lives. Three reasons, in order:
--
--   1. It is genuinely multi-valued, and this codebase's existing representation for a
--      multi-valued relationship is a table (`question_exams`, `section_subjects`,
--      `followed_exams`) -- never a delimited string and never JSON in a text column.
--   2. The question-sync system that will consume this has to answer "does this device want
--      Telugu content?" inside a SQL query. Against a table that is a join or an IN-subquery;
--      against a JSON blob it means reading and parsing a preferences row first.
--   3. It keeps `app_preferences` what it has always been -- one row of scalars.
--
-- Device-local and never synced, like every other preference here. The server has no notion of
-- a content-language preference, and an offline-first app must not need a round trip to decide
-- which language to render a question in.
--
-- `display_order` preserves the order the student chose, because the first selection is the one
-- screens default to. It is not a ranking of fluency.
--
-- Deliberately NO foreign key to `languages`, for the same reason `app_preferences.active_exam_code`
-- has none: a code may legitimately name a language whose row has not synced to this device yet,
-- and a constraint that turns that into a crash is worse than a read that filters it out.
--
-- Empty for every existing device, which is correct: nobody has been asked yet. The app falls
-- back to its previous single-language behaviour when this table is empty, so an install that
-- predates onboarding is unaffected.
CREATE TABLE IF NOT EXISTS `content_language_preferences` (
	`language_code` text PRIMARY KEY NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL
);
