-- Weakness Radar / Preparation Intelligence v1 (TASK-2201, tasks/TASK-2201-weakness-radar.md).
--
-- Adds ONE derived table plus two nullable columns. Nothing existing changes shape: the
-- question attempts this feature reads (user_practice_session_results from V6,
-- user_mock_attempt_results from V6) stay the immutable source of truth, and
-- user_topic_progress (V14, the coarse mastery ladder) is deliberately left untouched --
-- health and mastery answer different questions and merging them would break the
-- already-shipped topic-progress sync contract.

-- ------------------------------------------------------ Per-question time (optional signal)
-- The supplied spec's §9 wants a speed signal computed as actual/expected time. Neither half
-- exists today: no result row anywhere carries a per-question time, and there is no
-- expected-time benchmark per question or per topic. §9.2 is explicit that a missing signal
-- must not become fake data, so speed is EXCLUDED from the v1 health formula (its weight is
-- redistributed by renormalisation -- see TopicHealthService).
--
-- These two columns exist so capture can start now. Without them a future v2 speed signal
-- would have no history to derive an empirical benchmark from, and would need this same
-- migration later anyway. Nullable, and they stay null for every row uploaded by a client
-- that predates this release -- which is why every reader must treat null as "unknown",
-- never as zero.
ALTER TABLE user_practice_session_results ADD COLUMN time_ms INT;
ALTER TABLE user_mock_attempt_results ADD COLUMN time_ms INT;

-- ------------------------------------------------------------------ Topic health
-- One row per (student, topic): the derived diagnosis, recomputed from raw attempts.
--
-- A cache, not a record. The supplied §19 requires that health can always be recomputed from
-- historical attempts after a formula change, and nothing here is an input to anything -- so
-- a row may be deleted and rebuilt at any time with no loss.
--
-- Deliberately NOT keyed by algorithm_version, unlike topic_trend/topic_priority (V15) which
-- keep superseded versions on disk. Those rows are per (exam, topic) -- a few hundred -- and
-- carry editorial content (admin overrides and their reasons) that genuinely cannot be
-- recomputed. These rows are per (user, topic), so keeping every version would multiply them
-- by users x topics while holding nothing the raw attempts do not already reproduce exactly.
-- The version is stored as a plain column instead: a read whose stored version differs from
-- the code constant recomputes and replaces, which is the full-recalculation path §19 asks
-- for without a batch job to provision.
CREATE TABLE user_topic_health (
    -- Derived "userId:topicId", the same synthetic-key convention as user_bookmarks,
    -- user_topic_progress and exam_topics -- see ADR-005 for why a JPA @IdClass composite is
    -- avoided in this codebase (it produced real 500s on user_bookmarks).
    id                      VARCHAR(80) PRIMARY KEY,
    user_id                 UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    topic_id                UUID NOT NULL REFERENCES topics (id) ON DELETE CASCADE,

    -- Which formula produced the numbers below. Same purpose as topic_priority's column:
    -- a stored score has to stay interpretable after the formula changes.
    algorithm_version       VARCHAR(30) NOT NULL,

    -- How well the student currently performs (0-100). Stored at two decimals for the admin
    -- debug view; the student-facing API rounds, and mostly shows a band rather than a number
    -- at all (§18 -- no fake precision).
    health_score            NUMERIC(5,2) NOT NULL,

    -- How much the diagnosis can be trusted (0-100). A SEPARATE dimension from health, per
    -- §11: health 50 / confidence 35 and health 50 / confidence 92 are different situations
    -- and must not collapse into one number. Never shown to a student.
    confidence_score        NUMERIC(5,2) NOT NULL,

    -- INSUFFICIENT_DATA / DEVELOPING / STRONG / NEEDS_ATTENTION / NEEDS_REVISION / IMPROVING.
    -- A VARCHAR with a CHECK rather than a Postgres enum, matching how role and
    -- content_status are stored -- adding a state later is then a code change, not a
    -- migration against a live type.
    state                   VARCHAR(24) NOT NULL,

    -- Direction of travel, kept alongside (not inside) the state so §12's "health 63, trend
    -- IMPROVING, priority HIGH" can be shown as three facts rather than one flattened label.
    trend_direction         VARCHAR(24) NOT NULL,
    -- Signed percentage points: recent accuracy minus historical accuracy. Null when there
    -- is not enough evidence in both windows to compare them.
    trend_delta             NUMERIC(6,2),

    -- INSUFFICIENT_DATA / EARLY_SIGNAL / DEVELOPING_CONFIDENCE / RELIABLE (§4).
    evidence_level          VARCHAR(24) NOT NULL,

    -- The evidence, denormalised so the admin debug view (§22) and the student-facing
    -- explanation need no second pass over the attempt history.
    attempted_count         INT NOT NULL,
    correct_count           INT NOT NULL,
    recent_attempted_count  INT NOT NULL,
    recent_accuracy         NUMERIC(5,2),
    historical_accuracy     NUMERIC(5,2),
    pyq_attempted_count     INT NOT NULL,
    pyq_accuracy            NUMERIC(5,2),
    consistency_score       NUMERIC(5,2),

    -- Always NULL under TOPIC_HEALTH_V1. The column exists so the shape does not change when
    -- benchmarks become real; a reader must render absence as absence (§21), never as 1.0x.
    speed_ratio             NUMERIC(6,3),

    -- §22 auditability, same role as topic_priority.inputs: every component score and the
    -- weight actually applied to it after renormalisation, so "why does the app say I'm weak
    -- in this topic?" is answerable without re-running anything.
    inputs                  JSONB,

    last_attempt_at         TIMESTAMPTZ,
    -- The newest attempt included in this computation. A read whose user has an attempt newer
    -- than this recomputes -- this is the staleness check, and it is why no dirty flag,
    -- trigger or scheduled job is needed.
    evidence_through_at     TIMESTAMPTZ NOT NULL,
    computed_at             TIMESTAMPTZ NOT NULL,

    CONSTRAINT chk_user_topic_health_counts
        CHECK (correct_count <= attempted_count AND recent_attempted_count <= attempted_count),
    CONSTRAINT chk_user_topic_health_score
        CHECK (health_score >= 0 AND health_score <= 100),
    CONSTRAINT chk_user_topic_health_confidence
        CHECK (confidence_score >= 0 AND confidence_score <= 100),
    CONSTRAINT chk_user_topic_health_state
        CHECK (state IN ('INSUFFICIENT_DATA', 'DEVELOPING', 'STRONG',
                         'NEEDS_ATTENTION', 'NEEDS_REVISION', 'IMPROVING')),
    CONSTRAINT chk_user_topic_health_evidence_level
        CHECK (evidence_level IN ('INSUFFICIENT_DATA', 'EARLY_SIGNAL',
                                  'DEVELOPING_CONFIDENCE', 'RELIABLE'))
);

-- Every read is "this user's rows at the current algorithm version", so one composite index
-- serves the whole feature.
CREATE INDEX idx_user_topic_health_user ON user_topic_health (user_id, algorithm_version);
-- Deleting a topic has to be able to find its rows without scanning; matches the equivalent
-- index on user_topic_progress (V14).
CREATE INDEX idx_user_topic_health_topic ON user_topic_health (topic_id);
