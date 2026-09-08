-- TASK-2501 Phase 2 (see tasks/TASK-2501-question-intelligence-and-ingestion-system.md,
-- section F/T). Immutable raw output straight off a PDF -- one row per (document,
-- extractor_version, position-in-document), never UPDATE'd. Re-running extraction with a
-- new extractor_version inserts fresh rows; old ones stay untouched and queryable, same
-- discipline topic_trend.algorithm_version already established for this codebase.
--
-- document_id reuses TASK-2401's ingestion_documents table directly (shared DocumentStore/
-- PdfTextExtractor core, per the design's own explicit instruction not to build a second
-- one) -- a question-paper document simply has notice_id = NULL, which that table already
-- allows.

CREATE TABLE question_raw_extractions (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id          UUID NOT NULL REFERENCES ingestion_documents (id) ON DELETE CASCADE,
    extractor_version    VARCHAR(20) NOT NULL,
    position_in_document INT NOT NULL,
    page_number          INT,
    raw_question_text    TEXT NOT NULL,
    raw_options          JSONB,
    raw_answer_text      TEXT,
    is_text_extractable  BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_question_raw_extractions_document ON question_raw_extractions (document_id);

-- Idempotency: re-running the same extractor_version against the same document must be a
-- no-op, not a duplicate flood.
CREATE UNIQUE INDEX idx_question_raw_extractions_dedup
    ON question_raw_extractions (document_id, extractor_version, position_in_document);
