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
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt,
            OffsetDateTime publishedAt,
            String reviewedByEmail,
            long version) {

        public static AdminVideo from(LessonVideo v) {
            return new AdminVideo(
                    v.getId(), v.getBlueprintId(), v.getTopicId(), v.getQuestionId(),
                    v.getLanguageCode(), v.getTeachingLevel(), v.getQuality(), v.getContentVersion(),
                    v.getStatus(), v.getSource(), v.getContentStatus(), v.getRejectionReason(),
                    v.isPremium(), v.getMimeType(), v.getSizeBytes(), v.getDurationSeconds(),
                    v.getWidth(), v.getHeight(), v.getChecksumSha256(), v.getErrorMessage(),
                    v.getCreatedAt(), v.getUpdatedAt(), v.getPublishedAt(), v.getReviewedByEmail(),
                    v.getVersion());
        }
    }
}
