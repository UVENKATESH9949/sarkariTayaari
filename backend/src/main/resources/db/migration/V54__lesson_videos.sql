-- AI Video foundation - the teaching blueprint and the video that delivers it.
--
-- Two tables, and the split between them is the whole point. A blueprint is WHAT should be
-- taught; a video is ONE rendered delivery of it. Keeping them apart is what lets the same
-- teaching content later become a text lesson, an interactive lesson, an audio-only track, or
-- a locally-rendered lesson on a low-bandwidth device, without re-deciding what to teach.
-- Collapsing them into "a questions row with an mp4 url" would foreclose all of that.
--
-- WHERE THE BLUEPRINT SHAPE COMES FROM. It is not invented here. The AI Video Studio (a
-- separate repository) already defines a zod-validated Lesson JSON schema:
--   { id, title, exam, subject, topic, language, scenes[] }
-- where scenes is a discriminated union of title | concept | example | formula | summary.
-- That schema is what the studio's renderer and its narration synthesis both read, so it is
-- already the real contract. lesson_blueprints.payload stores that document verbatim. Defining
-- a second, prettier blueprint shape here would guarantee the two drift apart, and the studio's
-- is the one that can actually be rendered.
--
-- OWNER IS TOPIC *OR* QUESTION, and topic is the one that carries real content today - every
-- lesson the studio has produced so far is topic-scoped (Percentage Basics, Simple Interest,
-- Profit and Loss). Question-scoped video is supported from day one because the product wants
-- it, not because anything produces it yet. Two nullable FKs plus a CHECK follows the precedent
-- question_media (V29) and ai_content (V41) already set: real foreign keys mean real cascade
-- behaviour, which matters because the integration suite hard-deletes its fixture rows.

CREATE TABLE lesson_blueprints (
    id                UUID PRIMARY KEY,

    topic_id          UUID REFERENCES topics (id) ON DELETE CASCADE,
    question_id       UUID REFERENCES questions (id) ON DELETE CASCADE,

    language_code     VARCHAR(10) NOT NULL,

    -- The variant dimension ai_content deliberately lacks. ai_content is unique per
    -- (task, subject, language), which cannot express "English beginner" and "English advanced"
    -- as two live rows. Teaching level is exactly that axis, so it is part of the key here.
    teaching_level    VARCHAR(20) NOT NULL DEFAULT 'STANDARD',

    -- The studio's own lesson id ("profit-and-loss"). Not a foreign key - the studio is a
    -- separate repository with no shared database - but it is how a row here is reconciled
    -- against the file that produced it.
    studio_lesson_id  VARCHAR(100),

    -- The studio Lesson JSON, stored as the object it already is. Validated at the service
    -- layer against the scene-type vocabulary, the same "the table can describe it, only the
    -- enum decides what is real" defence question_types/QuestionTypeCode established.
    payload           JSONB NOT NULL,

    -- Which shape the payload conforms to. A future studio schema revision is a new row under
    -- a new schema version, never a silent reinterpretation of an old payload.
    schema_version    VARCHAR(32) NOT NULL,

    -- AUTHORED (hand-written), AI_GENERATED (a model produced it), IMPORTED (copied from the
    -- studio repository). Recorded because a human reviewer should know which they are reading.
    source            VARCHAR(20) NOT NULL,

    content_status    VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    rejection_reason  VARCHAR(500),

    created_at        TIMESTAMPTZ NOT NULL,
    updated_at        TIMESTAMPTZ NOT NULL,
    reviewed_at       TIMESTAMPTZ,
    reviewed_by_email VARCHAR(255),

    is_deleted        BOOLEAN NOT NULL DEFAULT FALSE,
    version           BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT ck_lesson_blueprints_one_owner CHECK (
        (topic_id IS NOT NULL AND question_id IS NULL)
     OR (topic_id IS NULL AND question_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX uq_lesson_blueprints_published_topic
    ON lesson_blueprints (topic_id, language_code, teaching_level)
    WHERE content_status = 'PUBLISHED' AND is_deleted = FALSE AND topic_id IS NOT NULL;

CREATE UNIQUE INDEX uq_lesson_blueprints_published_question
    ON lesson_blueprints (question_id, language_code, teaching_level)
    WHERE content_status = 'PUBLISHED' AND is_deleted = FALSE AND question_id IS NOT NULL;

CREATE INDEX idx_lesson_blueprints_status ON lesson_blueprints (content_status);
CREATE INDEX idx_lesson_blueprints_updated_at ON lesson_blueprints (updated_at);


-- One rendered delivery of a blueprint.
--
-- WHY THE OWNER IS DENORMALISED HERE rather than reached through blueprint_id: a video uploaded
-- by an admin may have no blueprint at all (the studio renders from a JSON file that never needed
-- to reach this database), and the hot read - "does this topic have a video for this language" -
-- must not depend on a blueprint row existing. blueprint_id stays as provenance when it is known.
--
-- WHY storage_key AND NOT A URL. Every other asset in this schema stores a public Cloudinary
-- secure_url directly on the row. That is wrong for video: a premium-gated video behind a public,
-- guessable URL is not gated at all. A key is resolved to bytes by VideoStorage at serve time, so
-- the backend stays the thing that decides who may watch, and swapping local disk for object
-- storage later is one class, not a schema change.
--
-- STATUS vs CONTENT_STATUS are two different questions and are deliberately separate columns.
-- status answers "does a playable file exist yet" (the generation lifecycle). content_status
-- answers "has a human approved it" (the same DRAFT -> REVIEW -> PUBLISHED workflow ai_content and
-- recruitment_cycles already use). A video can be READY and still unpublished, which is exactly
-- what an admin needs in order to watch it before students do.
--
-- NOT_AVAILABLE is deliberately NOT a status value. The absence of a row IS not-available; storing
-- it would mean writing a row for every question that has no video, which is most of them.
--
-- There is no separate job table in this phase. "Is generation already running for this owner" is
-- answerable from status IN (QUEUED, GENERATING, PROCESSING) on the row itself, so a job table
-- would duplicate state that already lives here. When a real generation runner is built it can
-- add one for attempt history; nothing here has to move for that to happen.

CREATE TABLE lesson_videos (
    id                 UUID PRIMARY KEY,

    blueprint_id       UUID REFERENCES lesson_blueprints (id) ON DELETE SET NULL,

    topic_id           UUID REFERENCES topics (id) ON DELETE CASCADE,
    question_id        UUID REFERENCES questions (id) ON DELETE CASCADE,

    language_code      VARCHAR(10) NOT NULL,
    teaching_level     VARCHAR(20) NOT NULL DEFAULT 'STANDARD',

    -- LOW / STANDARD / HIGH. One row per quality variant of the same lesson, so a low-bandwidth
    -- variant can be added later without touching the owner relationship (the point of §9).
    quality            VARCHAR(10) NOT NULL DEFAULT 'STANDARD',

    -- Bumped when the FILE changes for the same logical video. This is the device cache key,
    -- together with id: a device holding v1 sees v2 and re-downloads. Without it a corrected
    -- video would never reach anyone who already had the old one.
    content_version    INT NOT NULL DEFAULT 1,

    -- QUEUED / GENERATING / PROCESSING / READY / FAILED / ARCHIVED.
    status             VARCHAR(20) NOT NULL,

    -- ADMIN_UPLOAD / AI_GENERATED.
    source             VARCHAR(20) NOT NULL,

    storage_key        TEXT,
    mime_type          VARCHAR(100),
    size_bytes         BIGINT,
    duration_seconds   INT,
    width              INT,
    height             INT,

    -- Integrity for the device cache: a partially written download is detectable rather than
    -- being played as a corrupt file. Also what any future out-of-band distribution would verify
    -- a copy against.
    checksum_sha256    VARCHAR(64),

    content_status     VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
    rejection_reason   VARCHAR(500),

    -- Per-video rather than inherited from questions.is_premium, which is a dormant column no
    -- code reads. Video is the first thing in this product expensive enough to gate, and gating
    -- is enforced in the backend at serve time, never by hiding a button.
    is_premium         BOOLEAN NOT NULL DEFAULT FALSE,

    -- Operator-facing only. Never surfaced to a student; see §12 - a learner is told
    -- "preparing your explanation", not which render step failed.
    error_message      TEXT,

    created_at         TIMESTAMPTZ NOT NULL,
    updated_at         TIMESTAMPTZ NOT NULL,
    published_at       TIMESTAMPTZ,
    reviewed_by_email  VARCHAR(255),

    is_deleted         BOOLEAN NOT NULL DEFAULT FALSE,
    version            BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT ck_lesson_videos_one_owner CHECK (
        (topic_id IS NOT NULL AND question_id IS NULL)
     OR (topic_id IS NULL AND question_id IS NOT NULL)
    ),

    -- A READY video must actually be playable. This is the constraint that stops a row claiming
    -- readiness with nothing behind it, which is the failure a student would experience as a
    -- play button that does nothing.
    CONSTRAINT ck_lesson_videos_ready_has_file CHECK (
        status <> 'READY' OR storage_key IS NOT NULL
    )
);

-- One live video per (owner, language, teaching level, quality). This is §10 expressed as a
-- constraint: one question or topic resolves to one approved video, which every student shares.
CREATE UNIQUE INDEX uq_lesson_videos_published_topic
    ON lesson_videos (topic_id, language_code, teaching_level, quality)
    WHERE content_status = 'PUBLISHED' AND is_deleted = FALSE AND topic_id IS NOT NULL;

CREATE UNIQUE INDEX uq_lesson_videos_published_question
    ON lesson_videos (question_id, language_code, teaching_level, quality)
    WHERE content_status = 'PUBLISHED' AND is_deleted = FALSE AND question_id IS NOT NULL;

-- The hot read: "what video should this device play for this topic".
CREATE INDEX idx_lesson_videos_topic_lookup
    ON lesson_videos (topic_id, language_code, teaching_level)
    WHERE topic_id IS NOT NULL;

CREATE INDEX idx_lesson_videos_question_lookup
    ON lesson_videos (question_id, language_code, teaching_level)
    WHERE question_id IS NOT NULL;

CREATE INDEX idx_lesson_videos_status ON lesson_videos (status);
CREATE INDEX idx_lesson_videos_content_status ON lesson_videos (content_status);
CREATE INDEX idx_lesson_videos_updated_at ON lesson_videos (updated_at);
