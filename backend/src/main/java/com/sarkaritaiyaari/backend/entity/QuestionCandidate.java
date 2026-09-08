package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * TASK-2501 Phase 2 -- the staged, reviewable prospective question. {@code payload}
 * deserializes directly into (a subset of) {@code CreateQuestionRequest}'s own field names,
 * exactly the same "deserialize and call the existing service method" pattern TASK-2401's
 * {@code IngestionExtractionResult}/{@code ReviewQueueService} already established for a
 * different content type. One row per {@link #rawExtraction} in this rule-only MVP -- see
 * V38's own migration comment for why 1:1 is the honest cardinality today.
 */
@Entity
@Table(name = "question_candidates")
public class QuestionCandidate {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "raw_extraction_id", nullable = false)
    private QuestionRawExtraction rawExtraction;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ExtractionReviewStatus status = ExtractionReviewStatus.PENDING;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private Map<String, Object> payload;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ExtractionConfidence confidence;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "validation_warnings")
    private Map<String, Object> validationWarnings;

    @Column(name = "possible_duplicate_of_question_id")
    private UUID possibleDuplicateOfQuestionId;

    @Column(name = "duplicate_similarity_percent")
    private BigDecimal duplicateSimilarityPercent;

    @Column(name = "source_excerpt", columnDefinition = "text")
    private String sourceExcerpt;

    @Column(name = "rejection_reason")
    private String rejectionReason;

    @Column(name = "reviewed_by")
    private UUID reviewedBy;

    @Column(name = "reviewed_at")
    private OffsetDateTime reviewedAt;

    /** Set on Accept — the real {@code questions} row this candidate became. */
    @Column(name = "applied_question_id")
    private UUID appliedQuestionId;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public QuestionRawExtraction getRawExtraction() {
        return rawExtraction;
    }

    public void setRawExtraction(QuestionRawExtraction rawExtraction) {
        this.rawExtraction = rawExtraction;
    }

    public ExtractionReviewStatus getStatus() {
        return status;
    }

    public void setStatus(ExtractionReviewStatus status) {
        this.status = status;
    }

    public Map<String, Object> getPayload() {
        return payload;
    }

    public void setPayload(Map<String, Object> payload) {
        this.payload = payload;
    }

    public ExtractionConfidence getConfidence() {
        return confidence;
    }

    public void setConfidence(ExtractionConfidence confidence) {
        this.confidence = confidence;
    }

    public Map<String, Object> getValidationWarnings() {
        return validationWarnings;
    }

    public void setValidationWarnings(Map<String, Object> validationWarnings) {
        this.validationWarnings = validationWarnings;
    }

    public UUID getPossibleDuplicateOfQuestionId() {
        return possibleDuplicateOfQuestionId;
    }

    public void setPossibleDuplicateOfQuestionId(UUID possibleDuplicateOfQuestionId) {
        this.possibleDuplicateOfQuestionId = possibleDuplicateOfQuestionId;
    }

    public BigDecimal getDuplicateSimilarityPercent() {
        return duplicateSimilarityPercent;
    }

    public void setDuplicateSimilarityPercent(BigDecimal duplicateSimilarityPercent) {
        this.duplicateSimilarityPercent = duplicateSimilarityPercent;
    }

    public String getSourceExcerpt() {
        return sourceExcerpt;
    }

    public void setSourceExcerpt(String sourceExcerpt) {
        this.sourceExcerpt = sourceExcerpt;
    }

    public String getRejectionReason() {
        return rejectionReason;
    }

    public void setRejectionReason(String rejectionReason) {
        this.rejectionReason = rejectionReason;
    }

    public UUID getReviewedBy() {
        return reviewedBy;
    }

    public void setReviewedBy(UUID reviewedBy) {
        this.reviewedBy = reviewedBy;
    }

    public OffsetDateTime getReviewedAt() {
        return reviewedAt;
    }

    public void setReviewedAt(OffsetDateTime reviewedAt) {
        this.reviewedAt = reviewedAt;
    }

    public UUID getAppliedQuestionId() {
        return appliedQuestionId;
    }

    public void setAppliedQuestionId(UUID appliedQuestionId) {
        this.appliedQuestionId = appliedQuestionId;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
