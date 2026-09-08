-- TASK-2401 Task 3 of the approved MVP plan (see tasks/TASK-2401-exam-guidance-data-platform.md,
-- Document 2/9/18). One row per notice a source's adapter has ever discovered -- before/
-- without a downloaded document (that's ingestion_documents, a later task). Rows are
-- never deleted, only marked removed_at, per Document 9/11's "nothing is silently
-- overwritten" principle -- a notice that later disappears from the source's own listing
-- is evidence worth keeping (a withdrawn notification is itself a fact).
--
-- Task 1's real investigation of SSC's actual listing API found a genuine, stable
-- per-notice id -- external_ref is populated with it directly rather than relying only on
-- content_hash (kept anyway as a secondary "did the content actually change" signal, and
-- as the sole matching key for any future source that has no stable id of its own).
--
-- published_at is a small addition beyond Document 9's original column list (which named
-- only first_seen_at/last_seen_at/removed_at) -- the adapter already has the notice's own
-- publish date from the source, and dropping it on the floor would lose real information
-- for no reason.

CREATE TABLE ingestion_notices (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id     UUID NOT NULL REFERENCES ingestion_sources (id) ON DELETE CASCADE,
    external_ref  VARCHAR(200),
    title         TEXT NOT NULL,
    notice_url    TEXT,
    content_hash  VARCHAR(64) NOT NULL,
    published_at  TIMESTAMPTZ,
    first_seen_at TIMESTAMPTZ NOT NULL,
    last_seen_at  TIMESTAMPTZ NOT NULL,
    removed_at    TIMESTAMPTZ
);

-- A source with a stable external id must not create a second row for the same notice.
CREATE UNIQUE INDEX idx_ingestion_notices_source_external_ref
    ON ingestion_notices (source_id, external_ref) WHERE external_ref IS NOT NULL;

CREATE INDEX idx_ingestion_notices_source_content_hash ON ingestion_notices (source_id, content_hash);
CREATE INDEX idx_ingestion_notices_source_active ON ingestion_notices (source_id) WHERE removed_at IS NULL;
