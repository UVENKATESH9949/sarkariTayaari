package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Read and override shapes for computed topic intelligence (Epic L / TICKET-2106, 2107).
 *
 * <p>One combined row per topic rather than separate trend and priority endpoints: every
 * consumer — the admin console table, the mobile Practice screen, the future Preparation
 * Plan — needs both at once, and splitting them would make each caller join the two.
 */
public final class TopicIntelligenceDtos {

    private TopicIntelligenceDtos() {
    }

    /**
     * @param curatedWeightagePercent  the admin's figure from {@code exam_topics} (V12).
     * @param computedWeightagePercent the figure derived from PYQ data. Kept side by side
     *                                 with the curated one on purpose — §66 requires them to
     *                                 stay distinguishable, and seeing them disagree is
     *                                 useful signal in itself.
     * @param systemPriority           computed; never written by a human.
     * @param adminOverride            null when there is no override, which is different
     *                                 from an override of 0.
     * @param finalPriority            what consumers rank by: coalesce(override, system).
     * @param inputs                   the values the score was computed from (§67), so a
     *                                 recommendation stays explainable after the formula changes.
     */
    public record TopicIntelligence(
            UUID topicId,
            String topicName,
            UUID subjectId,
            String subjectName,
            UUID parentId,
            String parentName,

            BigDecimal curatedWeightagePercent,
            BigDecimal computedWeightagePercent,

            int appearanceCount,
            Integer windowFromYear,
            Integer windowToYear,
            String trendDirection,
            BigDecimal trendScore,

            BigDecimal systemPriority,
            BigDecimal adminOverride,
            BigDecimal finalPriority,
            String overrideReason,
            OffsetDateTime overrideAt,

            String algorithmVersion,
            Map<String, Object> inputs,
            OffsetDateTime computedAt
    ) {
    }

    /**
     * @param algorithmVersion the version these rows were computed by. Returned rather than
     *                         assumed by the client, so a stale admin console cannot silently
     *                         present old rows as current.
     * @param pyqTaggedCount   how many of the exam's questions carry a PYQ year at all.
     *                         Included because an empty or flat result is almost always
     *                         "nothing is tagged yet" rather than "every topic scores the
     *                         same", and the UI has to be able to say which.
     */
    public record ExamTopicIntelligenceResponse(
            String examCode,
            String algorithmVersion,
            long pyqTaggedCount,
            List<TopicIntelligence> topics
    ) {
    }

    /** Result of a recompute, for the admin console's confirmation. */
    public record RecomputeResponse(
            String examCode,
            String algorithmVersion,
            int topicsScored,
            long pyqTaggedCount,
            int overridesCarriedForward
    ) {
    }

    /**
     * An admin priority override (TICKET-2107).
     *
     * <p>{@code priority} is nullable — sending null clears the override and lets the
     * computed value take over again. {@code reason} is mandatory whenever a value is set;
     * an override with no stated reason is unauditable, which defeats the point of storing
     * it separately from the computed figure. Enforced here, in the service, and by a DB
     * CHECK in V15.
     */
    public static class OverrideRequest {
        @DecimalMin("0") @DecimalMax("100")
        private BigDecimal priority;

        private String reason;

        public BigDecimal getPriority() { return priority; }
        public void setPriority(BigDecimal priority) { this.priority = priority; }
        public String getReason() { return reason; }
        public void setReason(String reason) { this.reason = reason; }
    }

    /** Body for resolving a detected duplicate pair (TICKET-2109). */
    public static class DuplicateResolutionRequest {
        /** "DUPLICATE" or "NOT_DUPLICATE". */
        @NotBlank
        private String resolution;

        public String getResolution() { return resolution; }
        public void setResolution(String resolution) { this.resolution = resolution; }
    }

    /**
     * A pair awaiting review. Carries both questions' English text so the admin console can
     * render the queue without one extra fetch per row.
     */
    public record DuplicatePair(
            UUID questionId,
            String questionText,
            UUID duplicateOfQuestionId,
            String duplicateOfQuestionText,
            BigDecimal similarityPercent,
            String detectionMethod,
            OffsetDateTime detectedAt,
            OffsetDateTime resolvedAt,
            String resolution
    ) {
    }
}
