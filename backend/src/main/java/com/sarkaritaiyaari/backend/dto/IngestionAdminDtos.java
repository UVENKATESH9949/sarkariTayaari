package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.constraints.NotBlank;

import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * TASK-2401 Exam Guidance Data Platform -- admin-only DTOs for the ingestion pipeline
 * (Source Registry today; notices/documents/jobs/review-queue types join this class as
 * later tasks in the approved MVP plan land, matching {@code ExamGuideAdminDtos}'s
 * one-file-per-feature convention).
 */
public final class IngestionAdminDtos {

    private IngestionAdminDtos() {
    }

    public record IngestionSourceRequest(
            @NotBlank String organization,
            @NotBlank String name,
            @NotBlank String baseUrl,
            @NotBlank String sourceType,
            @NotBlank String parserKey,
            Map<String, Object> config,
            boolean active,
            Integer checkFrequencyMinutes) {
    }

    public record IngestionSourceResponse(
            UUID id,
            String organization,
            String name,
            String baseUrl,
            String sourceType,
            String parserKey,
            Map<String, Object> config,
            boolean active,
            int checkFrequencyMinutes,
            OffsetDateTime lastCheckedAt,
            OffsetDateTime lastSuccessAt,
            OffsetDateTime lastFailureAt,
            int consecutiveFailures,
            OffsetDateTime createdAt,
            OffsetDateTime updatedAt) {
    }

    /** One discovered notice, as stored -- Task 3's output. {@code documentUrl} is the most
     * recently stored document for this notice, if Task 4's fetch succeeded for it (null
     * otherwise -- a failed/skipped fetch is a normal, visible outcome, not an error). No
     * extraction fields yet, those join once Task 5+ lands. */
    public record IngestionNoticeResponse(
            UUID id,
            UUID sourceId,
            String externalRef,
            String title,
            String noticeUrl,
            OffsetDateTime publishedAt,
            OffsetDateTime firstSeenAt,
            OffsetDateTime lastSeenAt,
            OffsetDateTime removedAt,
            String documentUrl) {
    }

    /** Summary of one {@code POST /sources/{id}/scan} call -- Document 2's discovery step. */
    public record ScanResult(
            int discovered,
            int created,
            int updated,
            int unchanged,
            int removed) {
    }

    /** TASK-2401 Task 4 -- one stored document, deduplicated by sha256. */
    public record IngestionDocumentResponse(
            UUID id,
            UUID noticeId,
            String sourceUrl,
            String storageUrl,
            String sha256Hash,
            long fileSizeBytes,
            String mimeType,
            Integer pageCount,
            Boolean isTextExtractable,
            UUID supersedesDocumentId,
            OffsetDateTime createdAt) {
    }

    /** TASK-2401 Task 6/7/8 -- one prospective fact-row. {@code validationWarnings} is
     * null when Task 7's {@code ValidationEngine} found nothing to flag -- advisory only,
     * never blocks the candidate from existing. {@code appliedRecruitmentCycleId} is set
     * once Accept (Task 8) has actually created/attached a real Exam Guide row. */
    public record IngestionExtractionResultResponse(
            UUID id,
            UUID extractionJobId,
            UUID documentId,
            String targetType,
            String operation,
            UUID targetId,
            Map<String, Object> payload,
            String extractionMethod,
            String confidence,
            String sourceExcerpt,
            Map<String, Object> validationWarnings,
            String reviewStatus,
            String rejectionReason,
            UUID appliedRecruitmentCycleId,
            OffsetDateTime reviewedAt,
            OffsetDateTime createdAt) {
    }

    /** TASK-2401 Task 8 -- {@code overrides} merges into (and can replace) the stored
     * payload before it's applied; required for any field a rule-based extractor could
     * never know on its own (e.g. {@code examCode}/{@code status} for a brand-new
     * {@code RECRUITMENT_CYCLE_CORE}). {@code recruitmentCycleId} is required for every
     * target type except {@code RECRUITMENT_CYCLE_CORE} itself (Document 9's Q12: which
     * cycle a candidate belongs to is a reviewer decision, not automated in this MVP). */
    public record AcceptCandidateRequest(
            Map<String, Object> overrides,
            UUID recruitmentCycleId) {
    }

    public record RejectCandidateRequest(
            @NotBlank String reason) {
    }
}
