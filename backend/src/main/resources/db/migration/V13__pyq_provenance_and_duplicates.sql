-- Epic L / TICKET-2104 (PYQ provenance) and TICKET-2109 (server-side duplicate detection).
-- See preparation-os-requirements.md §18.3.
--
-- TICKET-2104 supersedes Epic F/TICKET-1501's narrower `pyq_exam_code` + `pyq_year`, which
-- was never built — folding it in here rather than building the narrow version first and
-- widening it later. The §18.2 audit found `questions` had 7 columns, none of them temporal
-- beyond `updated_at`, and `question_exam_types` is `(question_id, exam_code)` with no
-- "appeared in year N" semantics at all. Without a year there is nothing for TICKET-2106's
-- trend analysis to trend over.
--
-- Everything here is additive and nullable. An existing question stays exactly as it was:
-- `is_pyq` defaults to false, which is the truthful statement about a question nobody has
-- tagged as a previous-year one.

-- ------------------------------------------------------------------ PYQ provenance
-- `is_pyq` is stored rather than derived from `pyq_year IS NOT NULL`: a question can be
-- known to be a previous-year question while its exact year is still unverified, and
-- collapsing the two would make "PYQ, year unknown" unrepresentable.
ALTER TABLE questions ADD COLUMN is_pyq BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE questions ADD COLUMN pyq_year INT;

-- Free text, not an enum. Shift naming is not standardised across conducting bodies
-- ("Shift 1", "Morning", "Tier 1 Shift 2 (Afternoon)"), and a lookup table would have to
-- be curated per exam before a single question could be tagged.
ALTER TABLE questions ADD COLUMN pyq_shift VARCHAR(30);

-- Nullable FK to the real paper this appeared in, when it is known. ON DELETE SET NULL
-- rather than cascade or restrict: losing the paper row must not delete a question, and
-- must not block an admin from restructuring an exam pattern either. The year/shift
-- columns survive independently, so provenance degrades rather than disappearing.
ALTER TABLE questions ADD COLUMN source_paper_id UUID REFERENCES exam_papers (id) ON DELETE SET NULL;

ALTER TABLE questions ADD COLUMN question_number INT;
ALTER TABLE questions ADD COLUMN source_url TEXT;

-- Partial: the overwhelming majority of rows are not PYQs (all ~37,900 today), and every
-- query that reads these columns filters `is_pyq = true` first. A full index would be
-- almost entirely dead weight on the hottest write path in the system (bulk import).
CREATE INDEX idx_questions_pyq ON questions (pyq_year, pyq_shift) WHERE is_pyq = true;
CREATE INDEX idx_questions_source_paper ON questions (source_paper_id) WHERE source_paper_id IS NOT NULL;

-- ------------------------------------------------------------------ Duplicate detection
-- TICKET-2109. The §18.2 audit found the only dedup in the project is
-- admin/src/validateQuestions.js — exact-lowercased-text, **within the pasted batch only**,
-- warning-only, never checked against the existing bank. With ~37,900 questions already
-- stored and bulk import as the main ingestion path, that means a re-pasted file silently
-- doubles content.
--
-- `content_fingerprint` is a normalised-text digest of the English translation, stored on
-- the question so a candidate can be checked with an indexed equality lookup instead of a
-- full-table text comparison. MD5 is used deliberately and is NOT a security choice — this
-- is a content fingerprint, and md5() is the only digest available in stock Postgres
-- without enabling pgcrypto, which matters because the backfill below has to run in a
-- migration. The Java side computes the identical digest over the identical normalisation
-- (see DuplicateDetectionService.fingerprint) so rows written before and after this
-- migration compare equal.
ALTER TABLE questions ADD COLUMN content_fingerprint VARCHAR(32);

-- Backfilled from the English translation for every existing row. Normalisation is
-- lowercase + strip everything that is not a letter or digit, which is what makes
-- "What is 5 + 7?" and "what is 5+7 ?" collide — near-identical whitespace/punctuation
-- variants are exactly how the load-test filler and re-pasted files differ.
UPDATE questions q
SET content_fingerprint = md5(regexp_replace(lower(qt.question_text), '[^a-z0-9]+', '', 'g'))
FROM question_translations qt
WHERE qt.question_id = q.id
  AND qt.language_code = 'en';

CREATE INDEX idx_questions_content_fingerprint ON questions (content_fingerprint)
    WHERE content_fingerprint IS NOT NULL;

-- Near-duplicate *relationships*, not deletions. Supplied §14 is explicit that a detected
-- duplicate must be recorded rather than removed: the two rows may be legitimately
-- different questions that happen to share wording, and an automatic delete of real
-- content is unrecoverable. An admin resolves the pair; until then both stay live.
--
-- Directional (question_id was detected as a duplicate *of* duplicate_of_question_id, the
-- older row) so "which is the original" is not left ambiguous. The CHECK forbids the
-- self-pair; the PK forbids duplicate edges.
CREATE TABLE question_duplicates (
    question_id             UUID NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
    duplicate_of_question_id UUID NOT NULL REFERENCES questions (id) ON DELETE CASCADE,
    -- 100.00 = identical normalised text. Kept numeric rather than a boolean so a fuzzy
    -- matcher can be added later without a schema change or a second table.
    similarity_percent      NUMERIC(5,2) NOT NULL,
    -- How the pair was found, so a later fuzzy/AI matcher's verdicts stay distinguishable
    -- from today's exact-fingerprint ones. Same reasoning as topic_priority's
    -- algorithm_version below: a verdict has to stay explainable after the method changes.
    detection_method        VARCHAR(40) NOT NULL,
    detected_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Set once an admin has looked at the pair. NULL = still awaiting review, which is
    -- what the admin console's queue filters on.
    resolved_at             TIMESTAMPTZ,
    resolution              VARCHAR(20),
    PRIMARY KEY (question_id, duplicate_of_question_id),
    CONSTRAINT chk_question_duplicates_not_self CHECK (question_id <> duplicate_of_question_id),
    CONSTRAINT chk_question_duplicates_resolution
        CHECK (resolution IS NULL OR resolution IN ('DUPLICATE', 'NOT_DUPLICATE'))
);

CREATE INDEX idx_question_duplicates_unresolved ON question_duplicates (detected_at)
    WHERE resolved_at IS NULL;
CREATE INDEX idx_question_duplicates_target ON question_duplicates (duplicate_of_question_id);
