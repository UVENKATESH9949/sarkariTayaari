-- Exam Guide spec §36 "Content Validation States". No draft/review/published pattern
-- existed anywhere in this backend before this (confirmed by grep before writing this
-- migration) -- every admin write was immediately live. This adds the simplest version
-- that actually matches this project's role model: two states (DRAFT/PUBLISHED), not the
-- spec's three (DRAFT/REVIEW/PUBLISHED), because there is exactly one admin role today
-- and no distinct reviewer to hand a REVIEW state to.
--
-- Gated on the whole cycle, not per-field: eligibility/dates/documents/fees/steps/
-- mistakes are all children of one recruitment_cycles row (V17), so publishing the cycle
-- publishes everything under it in one step, matching how an admin actually works
-- (preparing a whole year's cycle before it goes live, not one field at a time).
--
-- Existing rows default to PUBLISHED -- they are already live and consumers already
-- depend on them being visible (including the seeded demo cycle). New rows created by
-- the application default to DRAFT at the Java entity level (RecruitmentCycle.java);
-- the DB-level DEFAULT here is PUBLISHED only so a direct SQL insert with no explicit
-- value fails safe as "already visible" rather than silently invisible, matching every
-- other boolean/status column added so far in this table (is_current, is_demo, status).
ALTER TABLE recruitment_cycles
    ADD COLUMN content_status VARCHAR(20) NOT NULL DEFAULT 'PUBLISHED';
