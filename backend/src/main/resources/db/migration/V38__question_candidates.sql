-- TASK-2501 Phase 2 (section R/T). The staged, reviewable row -- one per raw extraction for
-- this rule-only MVP (no AI pass exists yet that could ever produce more than one
-- interpretation of the same raw block, so a 1:1 relationship is the honest cardinality
-- today, not a simplification that will need undoing -- Phase 3's AI enrichment is expected
-- to widen this rather than restructure it).
--
-- status/confidence reuse the existing ExtractionReviewStatus (PENDING/ACCEPTED/EDITED/
-- REJECTED) and ExtractionConfidence (HIGH/MEDIUM/LOW) enums TASK-2401 already introduced --
-- both are generic candidate-review concepts, not tied to recruitment-cycle facts, so no
-- duplicate enum is created here.
--
-- payload is shaped like (a subset of) CreateQuestionRequest's own fields -- topicId/
-- examCodes/difficulty are deliberately absent from what the rule-based extractor can ever
-- populate; a reviewer supplies them as overrides on Accept, same as TASK-2401's own
-- Document 9 precedent that matching new content to real taxonomy is a human action.

CREATE TABLE question_candidates (
    id                                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    raw_extraction_id                  UUID NOT NULL REFERENCES question_raw_extractions (id) ON DELETE CASCADE,
    status                             VARCHAR(20) NOT NULL DEFAULT 'PENDING',
    payload                            JSONB NOT NULL,
    confidence                         VARCHAR(10) NOT NULL,
    validation_warnings                JSONB,
    possible_duplicate_of_question_id  UUID REFERENCES questions (id),
    duplicate_similarity_percent       NUMERIC(5,2),
    source_excerpt                     TEXT,
    rejection_reason                   TEXT,
    reviewed_by                        UUID,
    reviewed_at                        TIMESTAMPTZ,
    applied_question_id                UUID REFERENCES questions (id),
    created_at                         TIMESTAMPTZ NOT NULL
);

-- One candidate per raw extraction (see the migration's own comment on why 1:1 is honest
-- for this rule-only phase).
CREATE UNIQUE INDEX idx_question_candidates_raw_extraction ON question_candidates (raw_extraction_id);
CREATE INDEX idx_question_candidates_status ON question_candidates (status);
