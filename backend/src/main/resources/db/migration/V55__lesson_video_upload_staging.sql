-- Publishing a lesson video is what sends it to the object store, and this is the table that
-- makes that possible.
--
-- WHY THIS EXISTS. V54 uploaded straight to the object store the moment an admin attached a file,
-- inside the same transaction that wrote the row. Two things were wrong with that. The decided
-- product flow is that accepting a video is what publishes it, so an attached-but-unreviewed file
-- had already been sent to Cloudinary. And because the store call sat inside @Transactional, a
-- Cloudinary failure rolled the row back too - leaving no record, nothing to retry, and an admin
-- with no way to tell a failed upload from one that never happened.
--
-- So bytes now land here first. The row exists immediately in PENDING_UPLOAD; a reviewer streams
-- from here to watch it; accepting promotes the bytes to the object store and drops this row.
--
-- WHY THE DATABASE AND NOT LOCAL DISK. Cloud Run's filesystem is ephemeral and its instances
-- scale to zero, so a file attached on one request can be gone before the request that reviews it.
-- A staged upload has to survive that, and Postgres is the only durable thing this backend already
-- has that is not the object store we are deliberately not writing to yet. It is bounded: the
-- service caps a video at 20MB and a row lives only until the video is published or deleted.
--
-- WHY A SEPARATE TABLE rather than a BYTEA column on lesson_videos: a large column on the hot
-- table would be loaded by JPA on every read of every video unless lazily fetched, and lazy basic
-- fields need bytecode enhancement this project does not use. A separate entity keeps the read
-- path narrow by construction rather than by configuration.

CREATE TABLE lesson_video_uploads (
    video_id        UUID PRIMARY KEY REFERENCES lesson_videos (id) ON DELETE CASCADE,

    bytes           BYTEA NOT NULL,
    mime_type       VARCHAR(100) NOT NULL,
    size_bytes      BIGINT NOT NULL,
    checksum_sha256 VARCHAR(64) NOT NULL,

    created_at      TIMESTAMPTZ NOT NULL
);

-- Retry visibility. Without these an operator looking at a stuck video cannot tell a first
-- attempt that has not run yet from a fifth that keeps failing, and "allow the admin to retry"
-- means retrying blind.
ALTER TABLE lesson_videos
    ADD COLUMN upload_attempts        INT NOT NULL DEFAULT 0,
    ADD COLUMN last_upload_attempt_at TIMESTAMPTZ;

-- Every row written before this migration was uploaded eagerly by V54's code and already has its
-- file in the store, so one attempt is the truthful count for them.
UPDATE lesson_videos
   SET upload_attempts = 1,
       last_upload_attempt_at = created_at
 WHERE storage_key IS NOT NULL;

-- Finding what still needs promoting, without scanning a table that will mostly be published rows.
CREATE INDEX idx_lesson_videos_pending_upload
    ON lesson_videos (status)
    WHERE storage_key IS NULL AND is_deleted = FALSE;
