-- Server-side copies of a student's practice and mock-test history.
--
-- Mirrors the tables the app already keeps in local SQLite, so uploading is a straight
-- copy rather than a translation.
--
-- Two decisions worth recording:
--
-- 1. Primary keys are the ids the DEVICE generated, not new server ids. That makes
--    upload idempotent: re-sending a session that already arrived is a no-op instead of
--    a duplicate. A retrying queue on a flaky connection depends on this.
--
-- 2. Only question_id is stored per answer, not the question text and options. The
--    question bank is already synced to every device, so the text can be rejoined
--    locally on restore. Copying it per answer per user would multiply the same content
--    across every attempt by every student for no gain. The trade-off: if a question is
--    later deleted, that answer loses its detail on restore — but the session's score
--    and subject still survive, because those live on the parent row.

CREATE TABLE user_practice_sessions (
    id             VARCHAR(64) PRIMARY KEY,
    user_id        UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    completed_at   TIMESTAMPTZ NOT NULL,
    exam_label     VARCHAR(150),
    subject_name   VARCHAR(100),
    topic_name     VARCHAR(100),
    level_label    VARCHAR(50),
    correct_count  INT NOT NULL,
    total_count    INT NOT NULL,
    uploaded_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_practice_sessions_user ON user_practice_sessions (user_id, completed_at DESC);

CREATE TABLE user_practice_session_results (
    id             VARCHAR(96) PRIMARY KEY,
    session_id     VARCHAR(64) NOT NULL REFERENCES user_practice_sessions (id) ON DELETE CASCADE,
    order_index    INT NOT NULL,
    question_id    UUID NOT NULL,
    selected_index INT NOT NULL,
    correct_index  INT NOT NULL,
    is_correct     BOOLEAN NOT NULL
);

CREATE INDEX idx_user_practice_results_session ON user_practice_session_results (session_id);

CREATE TABLE user_mock_attempts (
    id                 VARCHAR(64) PRIMARY KEY,
    user_id            UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    exam_code          VARCHAR(30),
    exam_label         VARCHAR(200),
    started_at         TIMESTAMPTZ NOT NULL,
    completed_at       TIMESTAMPTZ NOT NULL,
    duration_seconds   INT NOT NULL,
    time_taken_seconds INT NOT NULL,
    -- Fractional: negative marking is rarely a whole number (SSC uses -0.5).
    marks_correct      NUMERIC(6,2) NOT NULL,
    marks_wrong        NUMERIC(6,2) NOT NULL,
    total_marks_scored NUMERIC(8,2) NOT NULL,
    correct_count      INT NOT NULL,
    wrong_count        INT NOT NULL,
    unattempted_count  INT NOT NULL,
    total_questions    INT NOT NULL,
    uploaded_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_mock_attempts_user ON user_mock_attempts (user_id, completed_at DESC);

CREATE TABLE user_mock_attempt_results (
    id                VARCHAR(96) PRIMARY KEY,
    attempt_id        VARCHAR(64) NOT NULL REFERENCES user_mock_attempts (id) ON DELETE CASCADE,
    order_index       INT NOT NULL,
    subject_name      VARCHAR(100),
    question_id       UUID NOT NULL,
    -- Nullable: an unattempted question has no answer, unlike practice where every
    -- recorded result was answered before moving on.
    selected_index    INT,
    correct_index     INT NOT NULL,
    marked_for_review BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX idx_user_mock_results_attempt ON user_mock_attempt_results (attempt_id);
