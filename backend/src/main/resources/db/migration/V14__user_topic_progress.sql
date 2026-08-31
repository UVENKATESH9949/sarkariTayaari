-- Epic L / TICKET-2105 — per-topic mastery. See preparation-os-requirements.md §18.3.
--
-- This is the prerequisite that unblocks three epics at once. The §18.2 audit found:
-- `user_practice_sessions.topic_name` is a denormalized *string* that no code aggregates,
-- and `user_mock_attempt_results` carries `subject_name` but **no topic at all** — so
-- per-topic weakness cannot be computed from existing data no matter how it is queried.
-- Epics A (weak-area detection), C (readiness) and D (Preparation Plan sequencing) all
-- assume this signal exists.
--
-- Shape follows user_bookmarks (V7), not user_practice_sessions: this is *mutable state*
-- per (user, topic), not an append-only event log. The same topic is practised repeatedly
-- from more than one device, so the table stores current state and resolves conflicting
-- devices by last-write-wins on updated_at. Synthetic "userId:topicId" id for the same
-- reason as V7 and V12 — see ADR-005 (a JPA @IdClass composite produced real 500s).

CREATE TABLE user_topic_progress (
    id                  VARCHAR(80) PRIMARY KEY,
    user_id             UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    topic_id            UUID NOT NULL REFERENCES topics (id) ON DELETE CASCADE,

    -- The state machine from the supplied §31. NOT_STARTED is stored explicitly rather
    -- than represented by an absent row: "the app knows you have not started this" and
    -- "the app has never heard of this topic" are different, and the Preparation Plan has
    -- to distinguish them to decide whether a topic is worth recommending.
    --
    -- NEEDS_REVISION is reachable only from MASTERED (a regression), which is why it is
    -- not simply another point on the ladder. The transition itself is enforced in the
    -- service, not here: a CHECK can constrain the value but not the legal moves between
    -- values, and the device is the thing that observes the regression.
    state               VARCHAR(20) NOT NULL DEFAULT 'NOT_STARTED',

    -- Rolling accuracy over the questions answered for this topic. Stored rather than
    -- recomputed on read because the per-question detail lives on the device for practice
    -- and would need a full history replay on every read otherwise.
    accuracy_percent    NUMERIC(5,2),
    attempted_count     INT NOT NULL DEFAULT 0,
    correct_count       INT NOT NULL DEFAULT 0,

    -- Epic C's per-question timing prerequisite (Section 8) aggregated to the topic. Kept
    -- here so readiness does not need to join the per-question tables at all.
    total_time_ms       BIGINT NOT NULL DEFAULT 0,

    last_practiced_at   TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_user_topic_progress UNIQUE (user_id, topic_id),
    CONSTRAINT chk_user_topic_progress_state
        CHECK (state IN ('NOT_STARTED', 'LEARNING', 'PRACTICING', 'MASTERED', 'NEEDS_REVISION')),
    -- Cheap invariants that catch a miscounting client before the bad row is stored and
    -- silently poisons every downstream average.
    CONSTRAINT chk_user_topic_progress_counts CHECK (correct_count <= attempted_count),
    CONSTRAINT chk_user_topic_progress_accuracy
        CHECK (accuracy_percent IS NULL OR (accuracy_percent >= 0 AND accuracy_percent <= 100))
);

-- The restore path reads every row for one user; the weak-area query reads them ordered by
-- accuracy. One index serves both.
CREATE INDEX idx_user_topic_progress_user ON user_topic_progress (user_id, accuracy_percent);
CREATE INDEX idx_user_topic_progress_topic ON user_topic_progress (topic_id);
