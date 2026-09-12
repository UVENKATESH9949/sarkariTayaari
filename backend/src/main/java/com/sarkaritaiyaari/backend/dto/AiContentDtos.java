package com.sarkaritaiyaari.backend.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * TASK-2701 Phase 2. One holder class for the AI-content API surface, matching this codebase's
 * own convention ({@code QuestionIngestionDtos}) rather than one file per record.
 */
public final class AiContentDtos {

    private AiContentDtos() {
    }

    /**
     * {@code subjectIds} is a question-id or topic-id list depending on {@code taskId}'s subject
     * kind -- there is deliberately no "generate for every question" mode. Generation always
     * costs real money and this pipeline cannot itself tell a real, authored question from one
     * of the ~35,700 synthetic load-test rows (no column distinguishes them), so scoping which
     * questions to spend on is a decision this endpoint always requires a caller to make
     * explicitly, never one it makes for them.
     */
    public record GenerateAiContentRequest(String taskId, String languageCode, List<UUID> subjectIds) {
    }

    public record AiContentItemResult(UUID subjectId, String outcome, String detail, UUID contentId) {
    }

    public record GenerateAiContentResult(
            int requested,
            int generated,
            int skippedExisting,
            int failedValidation,
            int failedProvider,
            List<AiContentItemResult> items) {
    }

    public record AiContentResponse(
            UUID id,
            String taskId,
            UUID questionId,
            UUID topicId,
            String languageCode,
            String promptVersion,
            String provider,
            String modelId,
            Map<String, Object> payload,
            String contentStatus,
            String rejectionReason,
            OffsetDateTime generatedAt,
            OffsetDateTime reviewedAt,
            String reviewedByEmail,
            OffsetDateTime updatedAt,
            long version) {
    }

    public record RejectAiContentRequest(String reason, long expectedVersion) {
    }

    public record TransitionAiContentRequest(long expectedVersion) {
    }

    /**
     * TASK-2701 Phase 3 — the public sync shape. Deliberately omits {@code rejectionReason},
     * {@code reviewedByEmail} and every admin-only field: this is what an unauthenticated device
     * sync request receives, and none of that is anyone but a reviewer's business.
     *
     * {@code payload} is null whenever {@code published} is false. A row leaving PUBLISHED (an
     * admin unpublishing a bad explanation) still appears here with {@code published: false} and
     * no payload, so an already-synced device can remove content it must no longer show — the
     * same tombstone role {@code isDeleted} plays for every other synced entity in this schema,
     * expressed here as "not published" rather than "deleted" because the row itself may still
     * exist, just not for public eyes.
     */
    public record AiContentSyncEntry(
            UUID id,
            String taskId,
            UUID questionId,
            UUID topicId,
            String languageCode,
            boolean published,
            Map<String, Object> payload,
            OffsetDateTime updatedAt) {
    }
}
