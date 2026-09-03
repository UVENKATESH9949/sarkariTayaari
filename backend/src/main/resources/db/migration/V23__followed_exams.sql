-- A student's followed exams, synced across devices.
--
-- Follow already existed, but purely as a local-only SQLite table (mobile/src/db/schema.ts's
-- followed_exams) -- no backend table at all, confirmed absent by grepping the whole
-- backend before this migration. Mirrors user_bookmarks (V7__user_bookmarks.sql) exactly:
-- current state per (user, exam) rather than a log of toggles, last-write-wins on
-- updated_at, and a tombstone (is_deleted) rather than a hard delete so an offline
-- unfollow doesn't silently reappear on the next restore.
--
-- The id is derived (user_id || ':' || exam_code), same convention as user_bookmarks and
-- user_practice_session_results -- one row per (user, exam), no JPA composite key.

CREATE TABLE followed_exams (
    id         VARCHAR(80) PRIMARY KEY,
    user_id    UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    exam_code  VARCHAR(40) NOT NULL,
    is_deleted BOOLEAN NOT NULL DEFAULT false,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_followed_exams_user ON followed_exams (user_id) WHERE is_deleted = false;
