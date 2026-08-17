-- A student's bookmarked questions, synced across devices.
--
-- Unlike practice sessions and mock attempts (write-once, append-only), a bookmark can
-- be added and removed repeatedly, from more than one device. This table stores the
-- current state per (user, question) rather than a log of toggles, and resolves
-- conflicting updates from different devices by last-write-wins on updated_at — the
-- same field the app already stamps locally every time a bookmark is toggled.
--
-- Removing a bookmark sets is_deleted rather than deleting the row. Without a tombstone,
-- a device that removed a bookmark while offline would see it silently reappear on its
-- next restore, because the server would have no record that a removal ever happened.
--
-- The id is derived (user_id || ':' || question_id), same convention as
-- user_practice_session_results — a bookmark is a single piece of state per question per
-- user, so two devices toggling the same question deterministically land on one row,
-- without the complexity of a JPA composite primary key.

CREATE TABLE user_bookmarks (
    id          VARCHAR(80) PRIMARY KEY,
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    question_id UUID NOT NULL,
    is_deleted  BOOLEAN NOT NULL DEFAULT false,
    updated_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_user_bookmarks_user ON user_bookmarks (user_id) WHERE is_deleted = false;
