-- TASK-2701 Phase 7.3 (follow-up) -- caches a generated PROFILE_SUMMARY narrative so opening the
-- Preparation Radar screen repeatedly does not re-bill a model call for facts that have not moved.
--
-- Why this exists now, when Phase 7.3 deliberately shipped without it: measuring real usage
-- (2026-09-14, against live Groq) showed PROFILE_SUMMARY was ~48% of per-user AI calls and ~57%
-- of per-user cost, purely because it was the one surface with no cache -- every screen mount,
-- pull-to-refresh, or sync-counter change regenerated an identical narrative. The original
-- reasoning (no natural row to persist onto, and facts that change too often for a cache to be
-- safe) was half right: there IS no natural row, but "the facts changed" is answerable exactly
-- rather than approximately -- see context_hash below.
--
-- content_hash, not a timestamp: the cache key is a SHA-256 over the exact facts the narrative
-- was generated from (exam, overview status, coverage counts, and every strength/weakness with
-- its state/trend/health). If the radar recomputes and nothing a narrative could mention actually
-- changed, the hash is identical and the cached narrative is still correct -- which a
-- computed_at comparison would have missed, regenerating for no reason. If anything the narrative
-- could cite did change, the hash changes and it regenerates. This is the same content-addressed
-- dedup idea ingestion_documents.sha256_hash already uses for a different purpose.
--
-- One row per (user, exam), replaced in place rather than appended: this is a cache, not history.
-- The id is derived (user_id || ':' || exam_code), the same synthetic-id convention
-- user_bookmarks and user_practice_session_results already use (ADR-005) instead of a JPA
-- composite key.

CREATE TABLE user_profile_summaries (
    id            VARCHAR(80) PRIMARY KEY,
    user_id       UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    exam_code     VARCHAR(30) NOT NULL,
    context_hash  VARCHAR(64) NOT NULL,
    language_code VARCHAR(10) NOT NULL,
    narrative     TEXT NOT NULL,
    generated_at  TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_user_profile_summaries_user ON user_profile_summaries (user_id);
