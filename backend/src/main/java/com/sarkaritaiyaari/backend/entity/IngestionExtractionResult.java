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

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * TASK-2401 Document 9 -- the candidate. {@code payload} deserializes directly into the
 * existing {@code *Request} DTO {@code targetType} names (see
 * {@code ExamGuideAdminDtos}) -- applying it on Accept (a later task) is meant to be a
 * mechanical "deserialize and call the existing service method," nothing new.
 */
@Entity
@Table(name = "ingestion_extraction_results")
public class IngestionExtractionResult {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "extraction_job_id", nullable = false)
    private IngestionExtractionJob extractionJob;

    @Enumerated(EnumType.STRING)
    @Column(name = "target_type", nullable = false)
    private ExtractionTargetType targetType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ExtractionOperation operation;

    /** The existing row an UPDATE proposes to change. Always null for the MVP -- every
     * candidate is a CREATE (Document 9's Q12: matching an UPDATE target is a reviewer
     * action, not built yet). */
    @Column(name = "target_id")
    private UUID targetId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(nullable = false)
    private Map<String, Object> payload;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "previous_value")
    private Map<String, Object> previousValue;

    @Enumerated(EnumType.STRING)
    @Column(name = "extraction_method", nullable = false)
    private ExtractionMethod extractionMethod;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private ExtractionConfidence confidence;

    @Column(name = "source_page")
    private Integer sourcePage;

    @Column(name = "source_excerpt")
    private String sourceExcerpt;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "validation_warnings")
    private Map<String, Object> validationWarnings;

    @Enumerated(EnumType.STRING)
    @Column(name = "review_status", nullable = false)
    private ExtractionReviewStatus reviewStatus = ExtractionReviewStatus.PENDING;

    @Column(name = "reviewed_by")
    private UUID reviewedBy;

    @Column(name = "reviewed_at")
    private OffsetDateTime reviewedAt;

    /** TASK-2401 Task 8 -- Document 12 requires a reason on reject; Document 9's original
     * schema had no column for one. Added here, not overloaded into
     * {@link #validationWarnings} (system-computed, not human-entered). */
    @Column(name = "rejection_reason")
    private String rejectionReason;

    @Column(name = "applied_recruitment_cycle_id")
    private UUID appliedRecruitmentCycleId;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public IngestionExtractionJob getExtractionJob() {
        return extractionJob;
    }

    public void setExtractionJob(IngestionExtractionJob extractionJob) {
        this.extractionJob = extractionJob;
    }

    public ExtractionTargetType getTargetType() {
        return targetType;
    }

    public void setTargetType(ExtractionTargetType targetType) {
        this.targetType = targetType;
    }

    public ExtractionOperation getOperation() {
        return operation;
    }

    public void setOperation(ExtractionOperation operation) {
        this.operation = operation;
    }

    public UUID getTargetId() {
        return targetId;
    }

    public void setTargetId(UUID targetId) {
        this.targetId = targetId;
    }

    public Map<String, Object> getPayload() {
        return payload;
    }

    public void setPayload(Map<String, Object> payload) {
        this.payload = payload;
    }

    public Map<String, Object> getPreviousValue() {
        return previousValue;
    }

    public void setPreviousValue(Map<String, Object> previousValue) {
        this.previousValue = previousValue;
    }

    public ExtractionMethod getExtractionMethod() {
        return extractionMethod;
    }

    public void setExtractionMethod(ExtractionMethod extractionMethod) {
        this.extractionMethod = extractionMethod;
    }

    public ExtractionConfidence getConfidence() {
        return confidence;
    }

    public void setConfidence(ExtractionConfidence confidence) {
        this.confidence = confidence;
    }

    public Integer getSourcePage() {
        return sourcePage;
    }

    public void setSourcePage(Integer sourcePage) {
        this.sourcePage = sourcePage;
    }

    public String getSourceExcerpt() {
        return sourceExcerpt;
    }

    public void setSourceExcerpt(String sourceExcerpt) {
        this.sourceExcerpt = sourceExcerpt;
    }

    public Map<String, Object> getValidationWarnings() {
        return validationWarnings;
    }

    public void setValidationWarnings(Map<String, Object> validationWarnings) {
        this.validationWarnings = validationWarnings;
    }

    public ExtractionReviewStatus getReviewStatus() {
        return reviewStatus;
    }

    public void setReviewStatus(ExtractionReviewStatus reviewStatus) {
        this.reviewStatus = reviewStatus;
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

    public String getRejectionReason() {
        return rejectionReason;
    }

    public void setRejectionReason(String rejectionReason) {
        this.rejectionReason = rejectionReason;
    }

    public UUID getAppliedRecruitmentCycleId() {
        return appliedRecruitmentCycleId;
    }

    public void setAppliedRecruitmentCycleId(UUID appliedRecruitmentCycleId) {
        this.appliedRecruitmentCycleId = appliedRecruitmentCycleId;
    }

    public OffsetDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(OffsetDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
