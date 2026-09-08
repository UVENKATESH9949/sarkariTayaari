-- TASK-2401 Task 5 of the approved MVP plan (Document 9/18). One row per document
-- processing attempt -- PENDING/RUNNING/SUCCEEDED/FAILED, per Document 15's reliability
-- table, which is also why there is no distributed lock or dead-letter queue here: a job
-- stuck RUNNING past a threshold is simply reaped back to PENDING on the next scan (a
-- later task, not built yet -- this migration just gives it somewhere to land).
--
-- fields_extracted_count/fields_requiring_ai_count/ai_tokens_used all default to 0 here
-- since Task 5 itself does no field-level extraction yet (that's Task 6's
-- RuleBasedExtractor) -- this job type only extracts text and detects sections.

CREATE TABLE ingestion_extraction_jobs (
    id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id               UUID NOT NULL REFERENCES ingestion_documents (id) ON DELETE CASCADE,
    parser_version            VARCHAR(20) NOT NULL,
    status                    VARCHAR(20) NOT NULL,
    started_at                TIMESTAMPTZ NOT NULL,
    finished_at               TIMESTAMPTZ,
    error_message             TEXT,
    fields_extracted_count    INT NOT NULL DEFAULT 0,
    fields_requiring_ai_count INT NOT NULL DEFAULT 0,
    ai_tokens_used            INT NOT NULL DEFAULT 0
);

CREATE INDEX idx_ingestion_extraction_jobs_document ON ingestion_extraction_jobs (document_id);
CREATE INDEX idx_ingestion_extraction_jobs_status ON ingestion_extraction_jobs (status);
