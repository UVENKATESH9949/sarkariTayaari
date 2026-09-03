--> HAND-EDITED, same convention as 0011-0014: the CREATE carries IF NOT EXISTS, which
--> drizzle-kit does not generate. A failed migration is a hard gate in app/_layout.tsx, so
--> table DDL is guarded wherever SQLite allows it. Pure CREATE TABLE, no ALTER, so nothing
--> here is unguardable.

--> Exam Guide spec §21 "Diagnostic Test". Local-only, like practice_sessions and
--> mock_test_attempts before it -- this records that an attempt happened (for a "you've
--> already taken one" history/entry-point decision later), not the scoring itself. Per-
--> topic mastery from a diagnostic feeds the SAME user_topic_progress table an ordinary
--> practice session does (via recordTopicPractice in db/topicProgressStore.ts), so a
--> diagnostic's results sync and show up in the Prepare checklist through the mechanism
--> that already exists -- no parallel progress model was built for this.
CREATE TABLE IF NOT EXISTS `diagnostic_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`exam_code` text NOT NULL,
	`started_at` integer NOT NULL,
	`completed_at` integer NOT NULL,
	`question_count` integer NOT NULL,
	`correct_count` integer NOT NULL,
	-- JSON array of {topicId, topicName, subjectName, correctCount, totalCount, state}, for the
	-- results screen and a future "view past diagnostic" history -- not re-derived from
	-- user_topic_progress, since that table is cumulative and would no longer show what THIS
	-- specific attempt contributed once more practice happens afterward.
	`per_topic_json` text NOT NULL
);
