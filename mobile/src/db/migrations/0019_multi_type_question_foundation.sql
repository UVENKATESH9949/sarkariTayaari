-- Multi-type question architecture, Phase P1 (TASK-2301,
-- tasks/TASK-2301-multi-type-question-architecture.md). Mirrors backend migration V25.
--
-- Hand-written, not `drizzle-kit generate` output, per this project's own standing rule
-- (see 0018's comment for why) — every ADD COLUMN below is unguardable on SQLite, so each
-- is checked individually for safety against a populated table:
--
-- `question_type` is NOT NULL, which SQLite allows for an ADD COLUMN only when a literal
-- DEFAULT is given — every existing row is correctly backfilled to 'SINGLE_CHOICE', matching
-- the server's own backfill for the same reason (every row before this migration is one).
-- The other three are nullable with no default — nothing writes them yet on the mobile
-- side (sync/writeQuestions.ts stores what the server sends, and only SINGLE_CHOICE is
-- authorable server-side in this phase), so every existing and newly-synced row correctly
-- gets NULL until a later phase's evaluator actually reads them.
ALTER TABLE `questions` ADD `question_type` text DEFAULT 'SINGLE_CHOICE' NOT NULL;--> statement-breakpoint
ALTER TABLE `questions` ADD `answer_key` text;--> statement-breakpoint
ALTER TABLE `questions` ADD `answer_config` text;--> statement-breakpoint
ALTER TABLE `questions` ADD `content_structure` text;
