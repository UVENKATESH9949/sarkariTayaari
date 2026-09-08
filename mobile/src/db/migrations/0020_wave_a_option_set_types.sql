-- Multi-type question architecture, Phase P2 Wave A (TASK-2301). Mirrors backend
-- migration V26. Hand-written, not `drizzle-kit generate` output, per this project's own
-- standing rule (see 0018's comment).
--
-- `content` on question_translations is nullable with no default -- nothing existing wrote
-- it, so every row correctly gets NULL. selected_index/correct_index on both result tables
-- were NOT NULL before this migration (except mock's selected_index, already nullable
-- since 0002); SQLite has no ALTER COLUMN DROP NOT NULL, so each is recreated via a temp
-- table swap instead.
--
-- No PRAGMA foreign_keys toggle here, deliberately -- this app never turns foreign key
-- enforcement on (db/client.ts opens the database with no such PRAGMA, confirmed by
-- reading it), so these FOREIGN KEY clauses have always been declarative documentation,
-- not an enforced constraint. Adding `PRAGMA foreign_keys=ON` at the end of this migration
-- -- the shape a generated "recreate table" migration normally has -- would be a real,
-- unintended behaviour change: enforcement turning on for the first time ever, against
-- real devices' data that has never been validated against it.
ALTER TABLE `question_translations` ADD `content` text;--> statement-breakpoint

CREATE TABLE `__new_practice_session_results` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`question_id` text NOT NULL,
	`question_text` text NOT NULL,
	`options` text NOT NULL,
	`selected_index` integer,
	`correct_index` integer,
	`explanation` text NOT NULL,
	`is_correct` integer NOT NULL,
	`time_ms` integer,
	`response` text,
	`outcome` text,
	`score_fraction` real,
	`question_type` text,
	FOREIGN KEY (`session_id`) REFERENCES `practice_sessions`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_practice_session_results`
    (`id`, `session_id`, `order_index`, `question_id`, `question_text`, `options`,
     `selected_index`, `correct_index`, `explanation`, `is_correct`, `time_ms`)
    SELECT `id`, `session_id`, `order_index`, `question_id`, `question_text`, `options`,
           `selected_index`, `correct_index`, `explanation`, `is_correct`, `time_ms`
    FROM `practice_session_results`;--> statement-breakpoint
DROP TABLE `practice_session_results`;--> statement-breakpoint
ALTER TABLE `__new_practice_session_results` RENAME TO `practice_session_results`;--> statement-breakpoint
CREATE INDEX `idx_practice_session_results_session_id` ON `practice_session_results` (`session_id`);--> statement-breakpoint

-- Backfill, mirroring backend V26 exactly: every existing row predates this migration and
-- is SINGLE_CHOICE. `selected_index` was NOT NULL here before this migration, so every
-- pre-existing row has a real integer to build `response` from. Populated for every row so
-- every future local reader (see intelligence/localEvidence.ts) can trust `outcome`
-- unconditionally instead of every query re-deriving it from the legacy columns forever.
UPDATE `practice_session_results`
SET `question_type` = 'SINGLE_CHOICE',
    `response` = '{"selectedOption":' || `selected_index` || '}',
    `outcome` = CASE WHEN `is_correct` = 1 THEN 'CORRECT' ELSE 'INCORRECT' END,
    `score_fraction` = CASE WHEN `is_correct` = 1 THEN 1.0 ELSE 0.0 END
WHERE `question_type` IS NULL;--> statement-breakpoint

CREATE TABLE `__new_mock_test_attempt_results` (
	`id` text PRIMARY KEY NOT NULL,
	`attempt_id` text NOT NULL,
	`order_index` integer NOT NULL,
	`subject_name` text NOT NULL,
	`question_id` text NOT NULL,
	`question_text` text NOT NULL,
	`options` text NOT NULL,
	`selected_index` integer,
	`correct_index` integer,
	`explanation` text NOT NULL,
	`marked_for_review` integer DEFAULT false NOT NULL,
	`time_ms` integer,
	`response` text,
	`outcome` text,
	`score_fraction` real,
	`question_type` text,
	FOREIGN KEY (`attempt_id`) REFERENCES `mock_test_attempts`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
INSERT INTO `__new_mock_test_attempt_results`
    (`id`, `attempt_id`, `order_index`, `subject_name`, `question_id`, `question_text`, `options`,
     `selected_index`, `correct_index`, `explanation`, `marked_for_review`, `time_ms`)
    SELECT `id`, `attempt_id`, `order_index`, `subject_name`, `question_id`, `question_text`, `options`,
           `selected_index`, `correct_index`, `explanation`, `marked_for_review`, `time_ms`
    FROM `mock_test_attempt_results`;--> statement-breakpoint
DROP TABLE `mock_test_attempt_results`;--> statement-breakpoint
ALTER TABLE `__new_mock_test_attempt_results` RENAME TO `mock_test_attempt_results`;--> statement-breakpoint
CREATE INDEX `idx_mock_test_attempt_results_attempt_id` ON `mock_test_attempt_results` (`attempt_id`);--> statement-breakpoint

-- Mock rows: `selected_index IS NULL` already means "left unattempted" (0002) -- preserved
-- as UNATTEMPTED / a null response, not coerced into a wrong answer. Mirrors backend V26.
UPDATE `mock_test_attempt_results`
SET `question_type` = 'SINGLE_CHOICE',
    `response` = CASE WHEN `selected_index` IS NULL THEN NULL
                       ELSE '{"selectedOption":' || `selected_index` || '}' END,
    `outcome` = CASE
        WHEN `selected_index` IS NULL THEN 'UNATTEMPTED'
        WHEN `selected_index` = `correct_index` THEN 'CORRECT'
        ELSE 'INCORRECT'
    END,
    `score_fraction` = CASE WHEN `selected_index` IS NOT NULL AND `selected_index` = `correct_index`
                             THEN 1.0 ELSE 0.0 END
WHERE `question_type` IS NULL;
