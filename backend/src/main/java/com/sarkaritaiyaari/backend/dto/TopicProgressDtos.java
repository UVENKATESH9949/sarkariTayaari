package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Shapes for syncing per-topic mastery (Epic L / TICKET-2105).
 *
 * <p>Mirrors {@link BookmarkDtos} rather than {@link ProgressDtos}: this is mutable state
 * per (user, topic), so every row carries its own {@code updatedAt} and the server resolves
 * competing devices last-write-wins on it.
 *
 * <p>The device computes the state and the aggregates — it holds the per-question practice
 * detail locally and the server never sees it. The server's job is to store the result and
 * reject the transitions that would corrupt it, not to re-derive them.
 */
public final class TopicProgressDtos {

    private TopicProgressDtos() {
    }

    public static class SyncRequest {
        @Valid
        private List<TopicProgress> topics = List.of();

        public List<TopicProgress> getTopics() { return topics; }
        public void setTopics(List<TopicProgress> topics) {
            this.topics = topics == null ? List.of() : topics;
        }
    }

    public static class TopicProgress {
        @NotNull private UUID topicId;

        /**
         * One of NOT_STARTED / LEARNING / PRACTICING / MASTERED / NEEDS_REVISION. A String
         * rather than the enum so an unknown value from a newer client becomes a readable
         * 400 instead of Jackson's raw deserialisation error, which names the Java type and
         * means nothing to whoever is reading the log.
         */
        @NotNull private String state;

        @DecimalMin("0") @DecimalMax("100")
        private BigDecimal accuracyPercent;

        @PositiveOrZero private int attemptedCount;
        @PositiveOrZero private int correctCount;
        @PositiveOrZero private long totalTimeMs;

        private OffsetDateTime lastPracticedAt;
        @NotNull private OffsetDateTime updatedAt;

        public UUID getTopicId() { return topicId; }
        public void setTopicId(UUID topicId) { this.topicId = topicId; }
        public String getState() { return state; }
        public void setState(String state) { this.state = state; }
        public BigDecimal getAccuracyPercent() { return accuracyPercent; }
        public void setAccuracyPercent(BigDecimal accuracyPercent) { this.accuracyPercent = accuracyPercent; }
        public int getAttemptedCount() { return attemptedCount; }
        public void setAttemptedCount(int attemptedCount) { this.attemptedCount = attemptedCount; }
        public int getCorrectCount() { return correctCount; }
        public void setCorrectCount(int correctCount) { this.correctCount = correctCount; }
        public long getTotalTimeMs() { return totalTimeMs; }
        public void setTotalTimeMs(long totalTimeMs) { this.totalTimeMs = totalTimeMs; }
        public OffsetDateTime getLastPracticedAt() { return lastPracticedAt; }
        public void setLastPracticedAt(OffsetDateTime v) { this.lastPracticedAt = v; }
        public OffsetDateTime getUpdatedAt() { return updatedAt; }
        public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
    }

    /**
     * @param stored   rows actually written.
     * @param rejected rows the server declined. Reported rather than silently dropped, and
     *                 counted separately from {@code stored}, so a client sending a stale
     *                 snapshot or an illegal transition can be noticed instead of assuming
     *                 the upload worked.
     */
    public record SyncResponse(int stored, int rejected) {
    }

    /**
     * A row on the way back down. Carries the topic and subject names because a fresh
     * install has no local mapping from topic id to anything displayable until the content
     * sync finishes, and restore runs first.
     */
    public record RestoredTopicProgress(
            UUID topicId,
            String topicName,
            UUID subjectId,
            String subjectName,
            String state,
            BigDecimal accuracyPercent,
            int attemptedCount,
            int correctCount,
            long totalTimeMs,
            OffsetDateTime lastPracticedAt,
            OffsetDateTime updatedAt
    ) {
    }

    public record RestoreResponse(List<RestoredTopicProgress> topics) {
    }
}
