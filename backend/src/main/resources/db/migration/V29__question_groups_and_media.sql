-- Multi-type question architecture, Phase P3 (TASK-2301,
-- tasks/TASK-2301-multi-type-question-architecture.md): shared content. A first-class
-- question_groups parent for passages/datasets shared by several child questions (so the
-- text is stored once, never duplicated per question), plus a real question_media table
-- (not JSON -- media needs querying and cleanup, per the architecture proposal).
--
-- Deliberately NOT what this migration does: no existing question gains a group_id here.
-- Every one of the ~37,900 existing questions stays exactly as it is (question_group_id
-- NULL) until an admin actually authors grouped content -- this migration only makes that
-- possible, it doesn't retrofit anything.

-- ------------------------------------------------------------------------- question_groups
-- Same shape family as question_types (V25): a real table so an admin can see/manage groups,
-- soft-deleted (never hard-deleted) so a sync tombstone can tell a device to drop its local
-- copy, exactly like `questions.is_deleted` already works.
CREATE TABLE question_groups (
    id          UUID PRIMARY KEY,
    group_type  VARCHAR(30) NOT NULL,
    updated_at  TIMESTAMPTZ NOT NULL,
    is_deleted  BOOLEAN NOT NULL DEFAULT false
);

-- group_type is validated against QuestionGroupType.java at the service layer (the same
-- "table can disable/describe, Java decides what's renderable" defence question_types
-- already uses) rather than a DB CHECK constraint, so a new group type is a code change
-- plus a data value, not a migration.

-- ------------------------------------------------------------ question_group_translations
-- The actual passage/dataset text, one row per (group, language) -- a real UUID primary
-- key, not a composite one, matching question_translations' own precedent (ADR-005: a
-- JPA @IdClass composite key caused real 500s for user_bookmarks before that ADR).
CREATE TABLE question_group_translations (
    id                  UUID PRIMARY KEY,
    question_group_id  UUID NOT NULL REFERENCES question_groups (id) ON DELETE CASCADE,
    language_code       VARCHAR(10) NOT NULL REFERENCES languages (code),
    passage_text         TEXT,
    UNIQUE (question_group_id, language_code)
);

-- passage_text is nullable: an IMAGE/MAP group may carry only a caption via question_media,
-- no body text at all -- forcing a non-null column would make admins type a meaningless
-- placeholder for those groups.

-- --------------------------------------------------------------------- questions extension
-- Nullable, both -- a question that belongs to no group (the entire existing bank, and
-- most future content too) leaves both null, exactly as before this migration.
ALTER TABLE questions ADD COLUMN question_group_id UUID REFERENCES question_groups (id);
ALTER TABLE questions ADD COLUMN group_order INT;

CREATE INDEX idx_questions_question_group_id ON questions (question_group_id) WHERE question_group_id IS NOT NULL;

-- ------------------------------------------------------------------------- question_media
-- A media asset (image or map) attached to either one question (its own diagram) or one
-- group (a shared passage image / DI chart) -- never both, enforced below. Real rows, not a
-- JSON array column on questions/question_groups, specifically so a later cleanup pass can
-- query "every media row whose owner is now soft-deleted" without scanning JSON.
CREATE TABLE question_media (
    id                  UUID PRIMARY KEY,
    question_id         UUID REFERENCES questions (id) ON DELETE CASCADE,
    question_group_id   UUID REFERENCES question_groups (id) ON DELETE CASCADE,
    media_type          VARCHAR(20) NOT NULL,
    url                 TEXT NOT NULL,
    mime_type            VARCHAR(50),
    display_order        INT NOT NULL DEFAULT 0,
    updated_at          TIMESTAMPTZ NOT NULL,
    is_deleted          BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT question_media_exactly_one_owner CHECK (
        (question_id IS NOT NULL AND question_group_id IS NULL) OR
        (question_id IS NULL AND question_group_id IS NOT NULL)
    )
);

CREATE INDEX idx_question_media_question_id ON question_media (question_id) WHERE question_id IS NOT NULL;
CREATE INDEX idx_question_media_question_group_id ON question_media (question_group_id) WHERE question_group_id IS NOT NULL;
