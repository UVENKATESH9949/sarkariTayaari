-- TASK-2401 Task 4 of the approved MVP plan (see tasks/TASK-2401-exam-guidance-data-platform.md,
-- Document 5/9/18). One row per unique downloaded file. sha256_hash is UNIQUE -- the same
-- bytes discovered again (same or different notice/URL) reuse this row rather than
-- re-uploading to Cloudinary or creating a duplicate (Document 12's dedup).
--
-- notice_id is nullable per Document 9's own column list (a document need not always be
-- tied to exactly one notice); ON DELETE SET NULL rather than CASCADE because a notice is
-- itself never hard-deleted in normal operation (see V31's own comment), but a document
-- should still survive even in that edge case -- storage cost already paid, no reason to
-- also lose the row.
--
-- page_count/is_text_extractable are nullable and left NULL here -- Task 4's scope is
-- storage/dedup only; Task 5 (PDFBox text extraction) is what actually populates them.
--
-- supersedes_document_id (Document 42/10): a re-fetched file at the same notice with
-- DIFFERENT bytes becomes a new row chained to the old one via this self-FK, never an
-- overwrite -- the old document (and whatever Task 5+ extracted from it) stays intact.

CREATE TABLE ingestion_documents (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    notice_id              UUID REFERENCES ingestion_notices (id) ON DELETE SET NULL,
    source_url             TEXT NOT NULL,
    storage_url            TEXT NOT NULL,
    sha256_hash            VARCHAR(64) NOT NULL,
    file_size_bytes        BIGINT NOT NULL,
    mime_type              VARCHAR(100) NOT NULL,
    page_count             INT,
    is_text_extractable    BOOLEAN,
    supersedes_document_id UUID REFERENCES ingestion_documents (id),
    created_at             TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX idx_ingestion_documents_sha256 ON ingestion_documents (sha256_hash);
CREATE INDEX idx_ingestion_documents_notice ON ingestion_documents (notice_id);
