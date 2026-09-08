-- TASK-2401 Task 6 of the approved MVP plan (Document 9/18). The candidate: one row per
-- prospective fact, shaped to match an existing Exam Guide *Request DTO 1:1 (payload is a
-- JSONB map deserializing directly into that DTO's field names). One row per prospective
-- fact-ROW, not per field, matching the granularity exam_sources already uses for
-- published citations (Document 9's own rationale).
--
-- target_id is nullable and, for this MVP pass, always null (every candidate is a CREATE
-- proposing a brand-new row) -- rule-based extraction alone cannot know which existing
-- exam/cycle a document belongs to (Document 9's own Q12: that's a reviewer action, a
-- later task). Kept nullable now so an UPDATE-operation candidate (matching an existing
-- row) can be added later without a schema change.
--
-- source_page exists for forward-compatibility with Document 9's original column list,
-- but is left unpopulated this task -- SectionDetector (Task 5) works on a document's
-- full concatenated text, not per-page, so no page number is available to attach yet.

CREATE TABLE ingestion_extraction_results (
    id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    extraction_job_id             UUID NOT NULL REFERENCES ingestion_extraction_jobs (id) ON DELETE CASCADE,
    target_type                   VARCHAR(30) NOT NULL,
    operation                     VARCHAR(10) NOT NULL,
    target_id                     UUID,
    payload                       JSONB NOT NULL,
    previous_value                JSONB,
    extraction_method             VARCHAR(20) NOT NULL,
    confidence                    VARCHAR(10) NOT NULL,
    source_page                   INT,
    source_excerpt                TEXT,
    validation_warnings           JSONB,
    review_status                 VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    reviewed_by                   UUID,
    reviewed_at                   TIMESTAMPTZ,
    applied_recruitment_cycle_id  UUID,
    created_at                    TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_ingestion_extraction_results_job ON ingestion_extraction_results (extraction_job_id);
CREATE INDEX idx_ingestion_extraction_results_review_status ON ingestion_extraction_results (review_status);
