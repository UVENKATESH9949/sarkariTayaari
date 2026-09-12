-- TASK-2701 Phase 4 -- per-task AI feature flags, and the public client-config feed a device
-- consults before offering an AI surface at all.
--
-- One row per task id, admin-toggled. Absence of a row (or of the whole table being empty on a
-- fresh install) means disabled -- the same "unknown means off" rule packages/core/src/ai/router.ts
-- already enforces client-side, now given a real server-side source of truth. task_id is a plain
-- VARCHAR, not a Postgres enum or an FK to a lookup table: the known-task-id list lives in the
-- AiTaskId Java enum (mirroring packages/core/src/ai/tasks.ts's AI_TASK_IDS), the same
-- "table can describe, only the enum decides what is real" defence question_types/QuestionTypeCode
-- already established -- an unrecognized task_id is rejected at the service layer, not by a DB
-- constraint that would need a migration every time the shared registry gains a task.
CREATE TABLE ai_task_flags (
    task_id           VARCHAR(64) PRIMARY KEY,
    enabled           BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at        TIMESTAMPTZ NOT NULL,
    updated_by_email  VARCHAR(255),
    version           BIGINT NOT NULL DEFAULT 0
);
