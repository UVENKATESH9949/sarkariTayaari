package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Objects;
import java.util.UUID;

/**
 * A detected near-duplicate <em>relationship</em> between two questions (Epic L /
 * TICKET-2109).
 *
 * <p>The pair is recorded, not resolved automatically. The supplied spec's §14 is explicit
 * about this and it is the right call: two questions can share wording and still be
 * genuinely different, and an automatic delete of real editorial content is unrecoverable.
 * Both rows stay live until an admin says which it is.
 *
 * <p>Directional — {@link #questionId} was detected as a duplicate <em>of</em>
 * {@link #duplicateOfQuestionId}, which is always the older row. Storing it undirected
 * would leave "which one is the original" ambiguous exactly when an admin needs to decide.
 *
 * <h2>Why this one uses {@code @IdClass} when nothing else does</h2>
 * ADR-005 records that a composite {@code @IdClass} broke {@code user_bookmarks} with real
 * 500s, and V12/V14 both avoid it for that reason. The failure there was Hibernate's
 * {@code isNew()} entity-state detection misbehaving for a <em>derived</em> composite id —
 * an id whose components are also mapped associations. Here both components are plain
 * {@code UUID} columns with no association mapping, so that path is not involved, and this
 * entity is only ever created via {@code persist()} (never {@code save()}/{@code merge()}),
 * which is what actually triggered the bug. A synthetic string key would work too but would
 * add a third column carrying no information.
 */
@Entity
@Table(name = "question_duplicates")
@IdClass(QuestionDuplicate.Key.class)
public class QuestionDuplicate {

    /** What an admin decided about a detected pair. Null resolution = still in the queue. */
    public enum Resolution {
        DUPLICATE,
        NOT_DUPLICATE
    }

    /** Exact normalised-text match via the stored fingerprint — today's only detector. */
    public static final String METHOD_EXACT_FINGERPRINT = "EXACT_FINGERPRINT";

    @Id
    @Column(name = "question_id", nullable = false)
    private UUID questionId;

    @Id
    @Column(name = "duplicate_of_question_id", nullable = false)
    private UUID duplicateOfQuestionId;

    @Column(name = "similarity_percent", nullable = false)
    private BigDecimal similarityPercent;

    /**
     * Kept as a String rather than an enum: a later fuzzy or AI matcher would add values
     * from outside this class, and an enum would then have to be edited in lockstep with
     * every deployment that can write a new method name.
     */
    @Column(name = "detection_method", nullable = false, length = 40)
    private String detectionMethod;

    @Column(name = "detected_at", nullable = false)
    private OffsetDateTime detectedAt;

    @Column(name = "resolved_at")
    private OffsetDateTime resolvedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "resolution", length = 20)
    private Resolution resolution;

    public UUID getQuestionId() { return questionId; }
    public void setQuestionId(UUID questionId) { this.questionId = questionId; }

    public UUID getDuplicateOfQuestionId() { return duplicateOfQuestionId; }
    public void setDuplicateOfQuestionId(UUID v) { this.duplicateOfQuestionId = v; }

    public BigDecimal getSimilarityPercent() { return similarityPercent; }
    public void setSimilarityPercent(BigDecimal v) { this.similarityPercent = v; }

    public String getDetectionMethod() { return detectionMethod; }
    public void setDetectionMethod(String detectionMethod) { this.detectionMethod = detectionMethod; }

    public OffsetDateTime getDetectedAt() { return detectedAt; }
    public void setDetectedAt(OffsetDateTime detectedAt) { this.detectedAt = detectedAt; }

    public OffsetDateTime getResolvedAt() { return resolvedAt; }
    public void setResolvedAt(OffsetDateTime resolvedAt) { this.resolvedAt = resolvedAt; }

    public Resolution getResolution() { return resolution; }
    public void setResolution(Resolution resolution) { this.resolution = resolution; }

    /** Composite key holder. Must be public with equals/hashCode for {@code @IdClass}. */
    public static class Key implements Serializable {
        private UUID questionId;
        private UUID duplicateOfQuestionId;

        public Key() {
        }

        public Key(UUID questionId, UUID duplicateOfQuestionId) {
            this.questionId = questionId;
            this.duplicateOfQuestionId = duplicateOfQuestionId;
        }

        public UUID getQuestionId() { return questionId; }
        public void setQuestionId(UUID questionId) { this.questionId = questionId; }

        public UUID getDuplicateOfQuestionId() { return duplicateOfQuestionId; }
        public void setDuplicateOfQuestionId(UUID v) { this.duplicateOfQuestionId = v; }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof Key other)) return false;
            return Objects.equals(questionId, other.questionId)
                    && Objects.equals(duplicateOfQuestionId, other.duplicateOfQuestionId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(questionId, duplicateOfQuestionId);
        }
    }
}
