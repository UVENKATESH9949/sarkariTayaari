-- TASK-3401 (Phase 6) — why a task was assigned.
--
-- Additive: one nullable column, nothing existing touched, no backfill. Tasks assigned before this
-- migration legitimately have no recorded reason, and NULL says exactly that.
--
-- WHY THIS IS STORED RATHER THAN DERIVED
-- Everything else this program computes is derived on read, deliberately. A reason is different:
-- it explains why a task was chosen AT THE MOMENT IT WAS CHOSEN. Deriving it later would re-explain
-- Monday's plan using Thursday's state — a different sentence, and a misleading one, since the very
-- thing Phase 6 exists to show is that the state moved in between.
--
-- 400 characters because these are one deterministic sentence, built from a small rule table in
-- DailyPlanService. They are not free text and never come from a model.
ALTER TABLE study_tasks ADD COLUMN reason VARCHAR(400);

COMMENT ON COLUMN study_tasks.reason IS
    'One deterministic sentence saying why this task was assigned, fixed at assignment time '
    '(TASK-3401). Null for tasks assigned before V50.';
