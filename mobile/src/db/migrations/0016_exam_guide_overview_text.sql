-- Hand-written, not the raw drizzle-kit output: `drizzle-kit generate` produced a full
-- CREATE TABLE for every exam_guide_* table (plus app_preferences/diagnostic_attempts and
-- a stray practice_sessions ADD COLUMN) instead of a minimal diff, because its snapshot
-- state doesn't match this schema's real migration history. Running that as-is would
-- CREATE TABLE tables that already exist on every device that ran migration 0014/0015 and
-- fail outright — this project's own STATUS.md already documents exactly this "generated
-- migration needs hand-editing" trap for both index and ADD COLUMN DDL. The only real
-- schema change here is one nullable column.
ALTER TABLE `exam_guide_cycles` ADD `overview_text` text;
