package com.sarkaritaiyaari.backend.dto;

import java.util.List;

/**
 * Phase 7 — request/response shapes for {@code POST /api/practice-sessions/{id}/feedback}
 * (7.1) and, later, the Mock Test/profile-summary equivalents (7.2/7.3). Mirrors
 * {@code packages/core/src/ai/context/types.ts}'s {@code SessionContext}/{@code TopicSnapshot}
 * field-for-field — the mobile client builds that shared shape and sends it verbatim; see
 * {@code PersonalNarrativeService}'s own doc comment for why the context is trusted as given
 * rather than re-derived server-side.
 */
public final class SessionFeedbackDtos {

    private SessionFeedbackDtos() {
    }

    public record TopicSnapshotDto(
            String topicId,
            String topicName,
            String subjectName,
            String state,
            Integer healthScore,
            String trend,
            List<String> reasonCodes) {
    }

    public record SessionFeedbackRequest(
            String sessionKind,
            String examCode,
            int answeredCount,
            int correctCount,
            int accuracyPercent,
            String preferredLanguage,
            List<TopicSnapshotDto> topics) {
    }

    /**
     * {@code narrative} is {@code null} on disabled/failed-validation/provider error — never a
     * 4xx/5xx for "the model declined", matching the router's own "a tier failure never becomes
     * a caller-visible error" rule.
     */
    public record SessionFeedbackResponse(String narrative) {
    }
}
