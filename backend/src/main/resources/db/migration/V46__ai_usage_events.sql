-- TASK-2701 Phase 7 (follow-up) -- queryable AI usage history, replacing log-line-only tracking.
--
-- Phase 1 shipped LoggingAIUsageRecorder and deliberately did NOT build this table, on the
-- explicit reasoning that nothing yet consumed usage data and a table built "because it sounds
-- useful" is the mistake to avoid (ADR-013). That condition has now changed: three live
-- per-student surfaces spend real money per call, and answering "what are we spending, on what"
-- meant grepping a dev machine's stdout -- which is exactly how the PROFILE_SUMMARY truncation
-- bug stayed invisible (every call billed in full and returned null, and nothing aggregated it).
--
-- One row per AI call, success or failure. Failures are recorded too, deliberately: a burst of
-- rate-limit or validation failures is the single most useful thing to be able to see, and it is
-- invisible if only successes are stored.
--
-- No pricing column, matching AIUsageEvent's own doc comment: per-model pricing changes on the
-- vendor's schedule, not ours, so cost stays a calculation over (model, tokens) done by whoever
-- reads this -- never a number frozen into each row at write time.
--
-- No retention policy is built. At ~6 calls/user/day this is ~22M rows/year at 10k DAU, which
-- Postgres handles comfortably but which nothing currently prunes -- worth revisiting before
-- that scale, not before.

CREATE TABLE ai_usage_events (
    id            UUID PRIMARY KEY,
    provider      VARCHAR(40) NOT NULL,
    model         VARCHAR(100),
    feature       VARCHAR(100),
    request_id    VARCHAR(100),
    input_tokens  INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    total_tokens  INTEGER NOT NULL,
    latency_ms    BIGINT NOT NULL,
    status        VARCHAR(20) NOT NULL,
    error_type    VARCHAR(100),
    occurred_at   TIMESTAMPTZ NOT NULL
);

-- Every read this table exists for is "usage since <time>, grouped by feature" -- so the index
-- leads with the time bound rather than indexing each dimension separately.
CREATE INDEX idx_ai_usage_events_occurred_at ON ai_usage_events (occurred_at DESC);
CREATE INDEX idx_ai_usage_events_feature ON ai_usage_events (feature, occurred_at DESC);
