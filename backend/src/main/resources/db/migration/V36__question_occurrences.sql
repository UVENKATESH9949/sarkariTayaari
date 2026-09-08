-- TASK-2501 Phase 1 (see tasks/TASK-2501-question-intelligence-and-ingestion-system.md,
-- section E). Closes the one real gap the architecture proposal found: questions.pyq_year/
-- pyq_shift/source_paper_id/question_number/source_url are singular columns, so the same
-- real-world question appearing in two exams has always meant two duplicate `questions`
-- rows. This table lets one canonical question have many exam appearances instead.
--
-- The legacy singular columns on `questions` are NOT dropped here (a two-step deprecation,
-- same discipline this project already uses for every other non-trivial column removal) --
-- QuestionService keeps writing both representations in sync going forward (see
-- QuestionService.syncLegacyOccurrence), and this migration backfills one is_legacy_derived
-- row per existing PYQ question so nothing existing loses its provenance.
--
-- source_document_id/page_number are populated only for occurrences the Phase 2 ingestion
-- pipeline creates (nullable, ON DELETE SET NULL -- a document can be cleaned up without
-- losing the fact that a question appeared in it, same reasoning V32's own comment gives
-- for ingestion_documents.notice_id). is_legacy_derived distinguishes "derived from the old
-- singular columns" (at most one such row per question, replaced on every update) from
-- "an additional occurrence someone explicitly recorded" (never touched automatically).

CREATE TABLE question_occurrences (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    question_id        UUID NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
    exam_code          VARCHAR(30),
    pyq_year           INT,
    pyq_shift          VARCHAR(30),
    source_paper_id    UUID,
    question_number    INT,
    source_url         TEXT,
    source_document_id UUID REFERENCES ingestion_documents (id) ON DELETE SET NULL,
    page_number        INT,
    verbatim_text      TEXT,
    is_legacy_derived  BOOLEAN NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_question_occurrences_question ON question_occurrences (question_id);

-- Idempotency for pipeline-created occurrences only (Phase 2 re-running extraction on the
-- same document/page/question-number must be a no-op, not a duplicate flood). Rows with no
-- source document (legacy-derived or manually-added) are unconstrained by this index.
CREATE UNIQUE INDEX idx_question_occurrences_source_dedup
    ON question_occurrences (source_document_id, page_number, question_number)
    WHERE source_document_id IS NOT NULL;

-- Backfill: every existing PYQ question becomes exactly one occurrence row. exam_code is
-- best-effort -- only set when the question maps to exactly one exam today (question_exam_
-- types is many-to-many, so a question tagged to several exams has no single correct answer
-- here; left NULL rather than guessed).
INSERT INTO question_occurrences (
    question_id, exam_code, pyq_year, pyq_shift, source_paper_id, question_number,
    source_url, is_legacy_derived, created_at
)
SELECT
    q.id,
    (SELECT MIN(qet.exam_code) FROM question_exam_types qet
      WHERE qet.question_id = q.id HAVING COUNT(*) = 1),
    q.pyq_year, q.pyq_shift, q.source_paper_id, q.question_number, q.source_url,
    true, now()
FROM questions q
WHERE q.is_pyq = true;
