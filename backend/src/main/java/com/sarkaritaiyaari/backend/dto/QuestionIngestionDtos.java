package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * TASK-2501 Phase 2 -- admin-only DTOs for the question-ingestion pipeline, mirroring
 * {@code IngestionAdminDtos}'s own one-file-per-feature convention.
 */
public final class QuestionIngestionDtos {

    private QuestionIngestionDtos() {
    }

    public record IngestDocumentRequest(@NotBlank String sourceUrl) {
    }

    /** One {@code POST /documents} call's result — the admin summary card the design's §R asks for. */
    public record IngestSummary(
            UUID documentId,
            int extracted,
            int autoAcceptable,
            int needsReview,
            int possibleDuplicates) {
    }

    /** One ingested source document, for the "which documents have I already scanned" list. */
    public record IngestedDocumentResponse(
            UUID documentId,
            String sourceUrl,
            Integer pageCount,
            Boolean isTextExtractable,
            int candidateCount,
            OffsetDateTime createdAt) {
    }

    /** One staged, reviewable prospective question. {@code payload} deserializes directly
     * into {@code CreateQuestionRequest}'s own field names once a reviewer's overrides are
     * merged in. */
    public record QuestionCandidateResponse(
            UUID id,
            UUID documentId,
            Integer pageNumber,
            Map<String, Object> payload,
            String confidence,
            Map<String, Object> validationWarnings,
            UUID possibleDuplicateOfQuestionId,
            BigDecimal duplicateSimilarityPercent,
            String sourceExcerpt,
            String status,
            String rejectionReason,
            UUID appliedQuestionId,
            OffsetDateTime reviewedAt,
            OffsetDateTime createdAt) {
    }

    /** {@code overrides} merges into (and can replace) the stored payload — required for
     * {@code topicId}/{@code examCodes}/{@code difficulty}, which a rule-based Pass 1 can
     * never know on its own (see {@code QuestionCandidateBuilder}'s own note). */
    public record AcceptQuestionCandidateRequest(Map<String, Object> overrides) {
    }

    public record RejectQuestionCandidateRequest(@NotBlank String reason) {
    }
}
