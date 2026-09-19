-- TASK-3301 (Phase 5) — the preparation profile reaches the server.
--
-- Additive only. One new table, nothing existing touched.
--
-- WHY THIS EXISTS NOW, AND NOT BEFORE
-- Onboarding (mobile migration 0027) asks for a display name, primary exam, stage, target year,
-- preparation level and daily study time, and writes all six to device-local `app_preferences`.
-- That was correct at the time and its own migration comment says why: onboarding runs BEFORE any
-- sign-in, because accounts in this app are optional, so the device is necessarily the source of
-- truth at the moment those values are written.
--
-- It also predicted this table, in the same comment: "Making the profile account-wide is an
-- additive backend table plus an endpoint plus a conflict rule for two devices disagreeing — real
-- work, deliberately not done here, and nothing in this migration would have to move to do it
-- later." Nothing in it moves.
--
-- The trigger is Phase 5: the daily planner runs on the server and has to know how much time the
-- student has. Decided by the project owner on 2026-09-19 (D5.1) — the phone sends the profile up,
-- rather than the server sending an unscheduled plan down for the device to allocate. The rejected
-- option would have needed the same allocation logic written twice, once for mobile and once for
-- web/, with a parity script to keep them honest — the tax this program has avoided since D3.2.
--
-- WHAT THIS DOES NOT CHANGE
-- The device keeps its own copy and onboarding still runs signed out. This row is authoritative
-- for PLANNING, which is narrower than being authoritative for the profile.
CREATE TABLE user_preparation_profiles (
    -- The user IS the key: one profile per account, made structural rather than left to a
    -- constraint. Mirrors how app_preferences is a single row per device.
    user_id           UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,

    display_name      VARCHAR(120),
    primary_exam_code VARCHAR(30),
    exam_stage_id     UUID,
    target_year       INT,

    -- Stored as the device's own vocabulary rather than translated: PREPARATION_LEVELS is
    -- JUST_STARTING/LEARNING/PRACTICING/REVISING/EXAM_READY and DAILY_STUDY_TIMES is
    -- UNDER_1H/ONE_TO_TWO/TWO_TO_FOUR/FOUR_TO_SIX/SIX_PLUS, both declared in packages/core.
    -- Validated in the service against those same lists, not by a CHECK here: the app's own
    -- enums are the definition, and a CHECK would be a second copy of them that can drift.
    preparation_level VARCHAR(30),
    daily_study_time  VARCHAR(30),

    -- Last-write-wins, exactly as user_bookmarks and followed_exams already resolve two devices
    -- disagreeing. Client-supplied, because the device that made the edit is the one that knows
    -- when it happened — including edits made offline and uploaded later.
    updated_at        TIMESTAMPTZ NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No FK on primary_exam_code or exam_stage_id, deliberately, and for the same reason V47 left
-- exam_code unconstrained: this is what the student told us during onboarding. An exam later
-- deactivated or a stage later restructured must not make an existing profile unwritable, and the
-- planner already degrades gracefully when an exam code resolves to nothing.

-- Every column except the timestamps is nullable. A student can complete onboarding having
-- skipped a step, and an account that has never onboarded has no profile row at all — which the
-- planner reads as "no stated study time" and budgets a declared default for, rather than
-- refusing to plan.
COMMENT ON TABLE user_preparation_profiles IS
    'Per-account preparation profile (TASK-3301). Device-first: onboarding writes app_preferences '
    'before sign-in, and this is the account-wide copy the server-side planner reads. Newest '
    'updated_at wins.';
