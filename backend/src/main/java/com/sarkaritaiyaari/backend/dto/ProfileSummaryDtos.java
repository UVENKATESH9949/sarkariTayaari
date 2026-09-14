package com.sarkaritaiyaari.backend.dto;

import com.sarkaritaiyaari.backend.dto.SessionFeedbackDtos.TopicSnapshotDto;

import java.util.List;

/**
 * Phase 7.3 — request shape for {@code POST /api/exams/{examCode}/profile-summary}. Mirrors
 * {@code packages/core/src/ai/context/types.ts}'s {@code LearnerProfileContext} field-for-field,
 * the same convention {@code SessionFeedbackDtos} follows for {@code SessionContext} — reuses
 * that class's {@code TopicSnapshotDto} rather than duplicating an identical record, since a
 * profile's strengths/weaknesses are shaped exactly like a session's topics.
 *
 * <p>Response is {@link SessionFeedbackDtos.SessionFeedbackResponse} — the wrapper is generic
 * enough ({@code narrative: string | null}) that a second identical record would be pure
 * duplication.
 */
public final class ProfileSummaryDtos {

    private ProfileSummaryDtos() {
    }

    public record ProfileSummaryRequest(
            String examCode,
            String overviewStatus,
            int topicsInSyllabus,
            int topicsWithEvidence,
            List<TopicSnapshotDto> strengths,
            List<TopicSnapshotDto> weaknesses,
            String preferredLanguage) {
    }
}
