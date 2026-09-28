package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.entity.LessonVideo;
import com.sarkaritaiyaari.backend.entity.LessonVideoUpload;
import com.sarkaritaiyaari.backend.entity.VideoStatus;
import com.sarkaritaiyaari.backend.repository.LessonVideoRepository;
import com.sarkaritaiyaari.backend.repository.LessonVideoUploadRepository;
import com.sarkaritaiyaari.backend.video.StoredObject;
import com.sarkaritaiyaari.backend.video.VideoStorage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.time.OffsetDateTime;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * Moves a staged video into the object store. This is what accepting a video actually does.
 *
 * <p><strong>Why this is its own class, and why it drives transactions by hand.</strong> The
 * upload must not share a transaction with the row updates around it. If it did, a storage failure
 * would mark that transaction rollback-only and take the failure record down with it - so an admin
 * would see a video that looked untouched, with no error, no attempt count, and no way to tell a
 * failure from a publish that never ran. This project has hit that exact shape before, in
 * {@code DocumentStoreService} and in the ingestion scan.
 *
 * <p>The usual fix is separate beans, because a {@code @Transactional} method called from inside
 * the same bean goes straight through and the annotation does nothing. {@link TransactionTemplate}
 * is used instead so the boundaries are visible in the code rather than depending on which object
 * a call happens to go through - a property this codebase has already lost time to twice.
 *
 * <p>The sequence is: claim the attempt and commit it, upload outside any transaction, then commit
 * the outcome. Each step is durable before the next begins, so a crash anywhere leaves a row that
 * says what was happening rather than one that says nothing happened.
 */
@Component
public class LessonVideoPublisher {

    private static final Logger log = LoggerFactory.getLogger(LessonVideoPublisher.class);

    private final LessonVideoRepository videos;
    private final LessonVideoUploadRepository staged;
    private final VideoStorage storage;
    private final TransactionTemplate tx;

    public LessonVideoPublisher(LessonVideoRepository videos,
                                LessonVideoUploadRepository staged,
                                VideoStorage storage,
                                PlatformTransactionManager transactionManager) {
        this.videos = videos;
        this.staged = staged;
        this.storage = storage;
        this.tx = new TransactionTemplate(transactionManager);
    }

    /** What promoting a video did, so a caller can report it without re-reading the row. */
    public enum Outcome {
        /** The file was uploaded to the object store on this call. */
        UPLOADED,
        /** The file was already in the store; nothing was re-uploaded. */
        ALREADY_STORED,
        /** The upload failed. The row records why, and the staged bytes are intact for a retry. */
        FAILED
    }

    /**
     * Ensures the video's file is in the object store, uploading it if it is not.
     *
     * <p>Idempotent on purpose. A video whose bytes are already stored returns
     * {@link Outcome#ALREADY_STORED} without touching the store, so publishing an already-published
     * video, or an admin pressing the button twice, cannot produce a second upload. When an upload
     * does run, the key is derived from the video id and content version and the store overwrites
     * rather than appends - so even a retry after an upload that secretly succeeded lands on the
     * same object rather than creating a twin.
     *
     * @return what happened. A storage failure is returned, never thrown: it is a state this
     *         feature has to be able to show and retry, not an error that unwinds everything.
     */
    public Outcome promote(UUID videoId, String actorEmail) {
        Attempt attempt = tx.execute(status -> beginAttempt(videoId));
        if (attempt == null || attempt.alreadyStored()) {
            return Outcome.ALREADY_STORED;
        }

        StoredObject stored;
        try {
            // Deliberately outside any transaction: this is a network call to a third party and
            // can take seconds. Holding a database connection open across it would tie up the
            // pool, and letting it fail inside a transaction is the bug this class exists to avoid.
            stored = storage.store(attempt.key(), attempt.bytes(), attempt.mimeType());
        } catch (RuntimeException e) {
            log.warn("video.publish upload failed id={} attempt={} by={}",
                    videoId, attempt.attemptNumber(), actorEmail, e);
            tx.executeWithoutResult(status -> markFailed(videoId, e));
            return Outcome.FAILED;
        }

        tx.executeWithoutResult(status -> markStored(videoId, stored));
        log.info("video.publish uploaded id={} key={} attempt={} by={}",
                videoId, stored.key(), attempt.attemptNumber(), actorEmail);
        return Outcome.UPLOADED;
    }

    /** Records that an attempt is starting, and hands back the bytes to upload. */
    private Attempt beginAttempt(UUID videoId) {
        LessonVideo video = videos.findByIdAndDeletedFalse(videoId)
                .orElseThrow(() -> new NoSuchElementException("Video not found: " + videoId));

        if (video.getStorageKey() != null && video.getStatus() == VideoStatus.READY) {
            return Attempt.nothingToUpload();
        }

        // IllegalArgumentException, not IllegalStateException: GlobalExceptionHandler maps the
        // former to 400 and has no handler for the latter, so the second would reach the admin as
        // a bare 500. TASK-2501 shipped exactly that mistake once.
        LessonVideoUpload file = staged.findById(videoId).orElseThrow(() -> new IllegalArgumentException(
                "This video has no attached file to publish. Upload the MP4 again."));

        video.setStatus(VideoStatus.UPLOADING);
        video.setUploadAttempts(video.getUploadAttempts() + 1);
        video.setLastUploadAttemptAt(OffsetDateTime.now());
        video.setErrorMessage(null);
        video.setUpdatedAt(OffsetDateTime.now());
        videos.save(video);

        return new Attempt(false, storageKeyFor(video), file.getBytes(), file.getMimeType(),
                video.getUploadAttempts());
    }

    private void markStored(UUID videoId, StoredObject stored) {
        LessonVideo video = videos.findByIdAndDeletedFalse(videoId)
                .orElseThrow(() -> new NoSuchElementException("Video not found: " + videoId));
        video.setStorageKey(stored.key());
        video.setStatus(VideoStatus.READY);
        video.setErrorMessage(null);
        // Only overwrite what the store actually measured. A store that reports nothing must not
        // erase a duration the admin supplied.
        if (stored.durationSeconds() != null) {
            video.setDurationSeconds(stored.durationSeconds());
        }
        if (stored.width() != null) {
            video.setWidth(stored.width());
        }
        if (stored.height() != null) {
            video.setHeight(stored.height());
        }
        video.setUpdatedAt(OffsetDateTime.now());
        videos.save(video);

        // The staged copy has done its job. Keeping it would mean holding every published video
        // twice, in this database as well as in the object store.
        staged.deleteById(videoId);
    }

    private void markFailed(UUID videoId, RuntimeException cause) {
        LessonVideo video = videos.findByIdAndDeletedFalse(videoId)
                .orElseThrow(() -> new NoSuchElementException("Video not found: " + videoId));
        video.setStatus(VideoStatus.UPLOAD_FAILED);
        video.setErrorMessage(describe(cause));
        video.setUpdatedAt(OffsetDateTime.now());
        videos.save(video);
        // The staged bytes are deliberately left in place. They are the only copy, and they are
        // what a retry uploads.
    }

    /**
     * Derived from the row rather than stored separately, so the same video always promotes to the
     * same object however many times it is retried - which is what stops a retry duplicating an
     * upload that had in fact succeeded.
     */
    static String storageKeyFor(LessonVideo video) {
        return "lesson-videos/" + video.getId() + "/v" + video.getContentVersion() + ".mp4";
    }

    /** Operator-facing only; a student is never shown this (see V54's note on error_message). */
    private static String describe(RuntimeException cause) {
        String message = cause.getMessage();
        String text = cause.getClass().getSimpleName() + (message == null ? "" : ": " + message);
        return text.length() > 2000 ? text.substring(0, 2000) : text;
    }

    private record Attempt(boolean alreadyStored, String key, byte[] bytes, String mimeType,
                           int attemptNumber) {
        /*
         * Named so it does NOT collide with the alreadyStored() accessor this record generates.
         * A static method sharing a record component's name is a compile error, which is the same
         * trap AICredentialStatus.valid() hit before it became ok().
         */
        static Attempt nothingToUpload() {
            return new Attempt(true, null, null, null, 0);
        }
    }
}
