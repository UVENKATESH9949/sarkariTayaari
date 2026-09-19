-- TASK-3301 (Phase 5) — the persisted daily assignment.
--
-- Additive only.
--
-- WHY THIS IS STORED, WHEN EVERY OTHER PHASE OF THIS PROGRAM DERIVES ON READ
-- Phases 3, 4 and 7 all compute on read and store nothing, deliberately (D3.6, D4.1, D7.3):
-- a second stored layer is a second thing that can go stale. This table is the exception, and
-- the reason is Phase 6 rather than Phase 5.
--
-- Without a record of what was ASSIGNED, "this student did no Percentage practice this week" is
-- four different situations that cannot be told apart:
--
--   A) Percentages was never assigned
--   B) assigned, and ignored
--   C) started, and abandoned
--   D) completed offline, not yet synced
--
-- Nothing else in the schema records the difference, and Phase 6 cannot adapt a plan without it.
-- So what is stored here is not a derived answer that might drift from its inputs — it is a
-- historical fact about what the system asked for on a given day, which nothing can recompute
-- after the fact.
CREATE TABLE study_tasks (
    id                    UUID PRIMARY KEY,
    user_id               UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- The day this was assigned for, in the student's own reckoning. A DATE rather than a
    -- timestamp: "today's plan" is a calendar day, and the zone it was resolved in is recorded
    -- alongside so a student who travels does not silently get two Mondays or none.
    plan_date             DATE        NOT NULL,
    plan_zone             VARCHAR(60) NOT NULL,

    exam_code             VARCHAR(30) NOT NULL,

    -- PRACTICE or REVISION. Which half of the program asked for it — the roadmap (work not yet
    -- done) or the revision plan (work done and fading). Kept because Phase 6 will want to know
    -- which kind of task a student skips.
    source                VARCHAR(20) NOT NULL,

    -- The RecommendedAction this resolves to (PRACTICE_FOUNDATIONAL, TIMED_PRACTICE, ...). Not a
    -- FK and not a CHECK: the action vocabulary lives in Java as an enum and is derived on read
    -- by the radar, so a copy of it here is a copy that can drift.
    action                VARCHAR(40) NOT NULL,

    topic_id              UUID        REFERENCES topics(id) ON DELETE SET NULL,
    subject_id            UUID        REFERENCES subjects(id) ON DELETE SET NULL,

    -- ON DELETE SET NULL rather than CASCADE on both: if a topic is later removed from the
    -- catalogue, the historical fact that it was assigned still happened, and Phase 6 reading
    -- "what did we ask for" must not find the row silently gone. Denormalised names keep the
    -- record readable after that.
    topic_name            VARCHAR(200),
    subject_name          VARCHAR(200),

    difficulty_code       VARCHAR(30),

    planned_minutes       INT         NOT NULL,
    planned_question_count INT,

    -- Where planned_minutes came from, carried through from the workload estimator so a task is
    -- as honest about its own numbers as the roadmap that produced it: PERSONAL_TOPIC,
    -- COHORT_TOPIC, COHORT_DIFFICULTY or DEFAULT.
    estimate_source       VARCHAR(30) NOT NULL,

    -- Position within the day, so "the first thing to do" survives a reload.
    display_order         INT         NOT NULL,

    -- ASSIGNED / COMPLETED / SKIPPED. Only ASSIGNED is written by this phase; the rest is Phase 6
    -- and whatever surface eventually lets a student act on a task. Recorded now so that phase
    -- adds behaviour rather than a migration.
    status                VARCHAR(20) NOT NULL DEFAULT 'ASSIGNED',

    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at            TIMESTAMPTZ,
    completed_at          TIMESTAMPTZ
);

-- The read this table exists to serve: one student's plan for one day and exam. Also the guard
-- against generating a second plan for a day that already has one.
CREATE INDEX idx_study_tasks_user_date ON study_tasks (user_id, plan_date, exam_code);

COMMENT ON TABLE study_tasks IS
    'What the planner asked a student to do on a given day (TASK-3301, Phase 5). Stored, unlike '
    'every other output of this program, because Phase 6 cannot tell an ignored task from one '
    'that was never assigned without it.';
