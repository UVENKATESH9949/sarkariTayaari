-- TASK-2401 Exam Guidance Data Platform, Task 2 of the approved MVP plan (see
-- tasks/TASK-2401-exam-guidance-data-platform.md, Document 3/9/18). The Source Registry:
-- one row per organization/site this app knows how to poll for new recruitment notices.
-- Deliberately named ingestion_sources, not exam_sources -- that table already exists
-- (V17) and means something different (a citation for a published fact), not a thing to
-- be scanned.
--
-- config is admin-entered JSONB, adapter-specific (allowed path prefixes, CSS-like
-- selectors, etc.) -- interpreted only by the Spring bean the parser_key resolves to
-- (Document 3's NoticeSourceAdapter map), never by this table itself.
--
-- No scanning/discovery logic ships with this migration -- this is Source Registry CRUD
-- only, per Task 2's own scope. active/check_frequency_minutes/last_*_at/
-- consecutive_failures exist now so later tasks (3, 30) have somewhere to write without a
-- second migration.

CREATE TABLE ingestion_sources (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization             VARCHAR(200) NOT NULL,
    name                     VARCHAR(200) NOT NULL,
    base_url                 TEXT NOT NULL,
    source_type              VARCHAR(20) NOT NULL,
    parser_key               VARCHAR(100) NOT NULL,
    config                   JSONB,
    active                   BOOLEAN NOT NULL DEFAULT true,
    check_frequency_minutes  INT NOT NULL DEFAULT 1440,
    last_checked_at          TIMESTAMPTZ,
    last_success_at          TIMESTAMPTZ,
    last_failure_at          TIMESTAMPTZ,
    consecutive_failures     INT NOT NULL DEFAULT 0,
    created_at               TIMESTAMPTZ NOT NULL,
    updated_at               TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_ingestion_sources_active ON ingestion_sources (active);
