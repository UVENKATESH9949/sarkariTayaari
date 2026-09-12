-- TASK-2701 Phase 2 — generated AI content, reviewed by a human before it reaches a student.
--
-- See AI_ARCHITECTURE.md §4 ("Tier 2 is the load-bearing idea"). A question explanation is the
-- same for every student who sees that question, so it is generated once, reviewed once, and then
-- shipped to devices as ordinary reference content. That is what makes offline AI explanations
-- possible on a 3GB phone with no model installed and no network — and it is why this table
-- exists instead of a per-request cache.
--
-- The review workflow deliberately reuses what already exists rather than inventing a parallel
-- one: the ContentStatus enum (DRAFT -> REVIEW -> PUBLISHED), the REVIEWER role, and the same
-- transition-endpoint shape ExamGuideAdminController already uses for recruitment cycles. An AI
-- explanation is never shown because a model produced it; it is shown because a human approved
-- it. That is this project's answer to the "no invented facts" requirement.
--
-- Subject columns follow question_media's precedent (V29): two nullable FKs plus a CHECK that
-- exactly one is set, rather than a polymorphic (type, id) pair. Real foreign keys mean real
-- cascade behaviour — which matters, because the integration suite hard-deletes its fixture
-- questions and would otherwise leave orphans behind.

CREATE TABLE ai_content (
    id                UUID PRIMARY KEY,

    -- Mirrors the task ids in packages/core/src/ai/tasks.ts. Stored as text and validated against
    -- the AiContentTask enum at the service layer — the same "the table can describe it, only the
    -- enum decides what is real" defence question_types/QuestionTypeCode already established.
    task_id           VARCHAR(64) NOT NULL,

    question_id       UUID REFERENCES questions (id) ON DELETE CASCADE,
    topic_id          UUID REFERENCES topics (id) ON DELETE CASCADE,

    language_code     VARCHAR(10) NOT NULL,

    -- Which prompt and which model produced this. Both are part of the identity of the content:
    -- regenerating under a new prompt version is a new row, not an overwrite, so a bad prompt
    -- revision can be rolled back by publishing the previous row rather than re-running the model.
    prompt_version    VARCHAR(32) NOT NULL,
    provider          VARCHAR(32) NOT NULL,
    model_id          VARCHAR(128) NOT NULL,

    -- The validated structured response (see packages/core/src/ai/schema/types.ts). Stored as the
    -- object it already is rather than as prose, so the app renders each part in its own place.
    payload           JSONB NOT NULL,

    content_status    VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    rejection_reason  VARCHAR(500),

    generated_at      TIMESTAMPTZ NOT NULL,
    reviewed_at       TIMESTAMPTZ,
    reviewed_by_email VARCHAR(255),

    -- updated_at + is_deleted are the delta-sync pair every synced table in this schema uses.
    -- Phase 3 exposes this table through the existing reference sync; a tombstone is how an
    -- unpublished row stops being served to a device that already has it.
    updated_at        TIMESTAMPTZ NOT NULL,
    is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,

    version           BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT ck_ai_content_one_subject CHECK (
        (question_id IS NOT NULL AND topic_id IS NULL)
     OR (question_id IS NULL AND topic_id IS NOT NULL)
    )
);

-- At most one PUBLISHED row per (task, subject, language). Drafts and rejected rows may pile up
-- freely — that is the point of keeping history — but exactly one thing can be live at a time.
-- Partial unique index, the same technique recruitment_cycles uses for is_current.
CREATE UNIQUE INDEX uq_ai_content_published_question
    ON ai_content (task_id, question_id, language_code)
    WHERE content_status = 'PUBLISHED' AND is_deleted = FALSE AND question_id IS NOT NULL;

CREATE UNIQUE INDEX uq_ai_content_published_topic
    ON ai_content (task_id, topic_id, language_code)
    WHERE content_status = 'PUBLISHED' AND is_deleted = FALSE AND topic_id IS NOT NULL;

-- The review queue reads by status; the sync path reads by updated_at.
CREATE INDEX idx_ai_content_content_status ON ai_content (content_status);
CREATE INDEX idx_ai_content_updated_at ON ai_content (updated_at);

-- "Does this question already have content for this task and language" — asked once per candidate
-- on every generation pass, so it is worth an index even at today's volumes.
CREATE INDEX idx_ai_content_question_lookup
    ON ai_content (question_id, task_id, language_code)
    WHERE question_id IS NOT NULL;
