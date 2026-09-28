package com.sarkaritaiyaari.backend.dto;

import com.sarkaritaiyaari.backend.entity.ContentStatus;
import com.sarkaritaiyaari.backend.entity.LessonVideo;
import com.sarkaritaiyaari.backend.entity.TeachingLevel;
import com.sarkaritaiyaari.backend.entity.VideoQuality;
import com.sarkaritaiyaari.backend.entity.VideoSource;
import com.sarkaritaiyaari.backend.entity.VideoStatus;

import java.time.OffsetDateTime;
import java.util.UUID;

/** Wire shapes for the lesson-video endpoints. */
public final class LessonVideoDtos {

    private LessonVideoDtos() {
    }

    /**
     * What a device is told when it asks whether a lesson video exists.
     *
     * <p>{@code available} is a single question a client can branch on without knowing the status
     * vocabulary. {@code status} is there so a client that DOES care can distinguish "nothing
     * exists" from "being prepared" from "failed" - which is what drives the difference between
     * showing no button, a progress state, and a retry.
     *
     * <p>{@code playbackPath} is a path on this backend, never a storage URL. That is what keeps
     * entitlement enforceable: the bytes are served through an endpoint that can say no.
     *
     * <p>{@code resolvedVia} tells a question-scoped caller whether it got a video made for that
     * exact question or the one for its topic. Without it a client cannot honestly label what the
     * student is about to watch.
     */
    public record VideoAvailability(
            boolean available,
            UUID videoId,
            VideoStatus status,
            String resolvedVia,
            int contentVersion,
            Integer durationSeconds,
            Long sizeBytes,
            VideoQuality quality,
            String languageCode,
            TeachingLevel teachingLevel,
            String checksumSha256,
            boolean requiresPremium,
            boolean entitled,
            String playbackPath) {

        /** No row at all. This is what {@code NOT_AVAILABLE} means, without storing it. */
        public static VideoAvailability notAvailable() {
            return new VideoAvailability(false, null, null, null, 0, null, null, null, null, null,
                    null, false, true, null);
        }
    }

    /** Full admin view of a video row. */
    public record AdminVideo(
            UUID id,
            UUID blueprintId,
            UUID topicId,
            UUID questionId,
            String languageCode,
            TeachingLevel teachingLevel,
            VideoQuality quality,
            int contentVersion,
            VideoStatus status,
            VideoSource source,
            ContentStatus contentStatus,
            String rejectionReason,
            boolean premium,
            String mimeType,
            Long sizeBytes,
            Integer durationSeconds,
            Integer width,
            Integer height,
            String checksumSha256,
            String errorMessage,
            int uploadAttempts,
            OffsetDateTime lastUploadAttemptAt,
            boolean hasStagedFile,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt,
            OffsetDateTime publishedAt,
            String reviewedByEmail,
            long version) {

        /**
         * @param hasStagedFile whether the attached file is still held in the staging table -
         *                      i.e. whether publishing has bytes to promote, or whether a retry
         *                      has anything left to retry with. The caller supplies it because
         *                      answering it from the video row alone would be a guess.
         */
        public static AdminVideo from(LessonVideo v, boolean hasStagedFile) {
            return new AdminVideo(
                    v.getId(), v.getBlueprintId(), v.getTopicId(), v.getQuestionId(),
                    v.getLanguageCode(), v.getTeachingLevel(), v.getQuality(), v.getContentVersion(),
                    v.getStatus(), v.getSource(), v.getContentStatus(), v.getRejectionReason(),
                    v.isPremium(), v.getMimeType(), v.getSizeBytes(), v.getDurationSeconds(),
                    v.getWidth(), v.getHeight(), v.getChecksumSha256(), v.getErrorMessage(),
                    v.getUploadAttempts(), v.getLastUploadAttemptAt(), hasStagedFile,
                    v.getCreatedAt(), v.getUpdatedAt(), v.getPublishedAt(), v.getReviewedByEmail(),
                    v.getVersion());
        }
    }

    /**
     * One published topic video, as the AI Videos browse screen needs it.
     *
     * <p>Only topics that HAVE a video appear. A topic without one is not represented here at all,
     * and the client shows its empty state from the absence - the same "no row means not
     * available" rule {@link VideoAvailability#notAvailable()} already follows. Sending a row per
     * topic-without-a-video would make the response scale with the syllabus instead of with the
     * content, which is backwards for a product that assumes a slow connection.
     *
     * <p>Nothing Cloudinary-shaped is in here: no public id, no storage key, no signed URL.
     * {@code playbackPath} is a path on this backend, so entitlement stays enforceable and the
     * object store stays an implementation detail the app never learns.
     */
    public record TopicVideoCatalogEntry(
            UUID topicId,
            /**
             * The topic's subject, resolved here rather than on the device. A client browsing by
             * subject would otherwise have to map every topic id back to a subject itself, and
             * the server is already holding the topic rows needed to answer it.
             */
            UUID subjectId,
            UUID videoId,
            int contentVersion,
            Integer durationSeconds,
            Long sizeBytes,
            String languageCode,
            TeachingLevel teachingLevel,
            VideoQuality quality,
            String checksumSha256,
            boolean requiresPremium,
            boolean entitled,
            String playbackPath) {
    }

    /** The catalog response. A wrapper, so a later cursor or generation stamp is additive. */
    public record TopicVideoCatalog(java.util.List<TopicVideoCatalogEntry> items) {
    }
}
