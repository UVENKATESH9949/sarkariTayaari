package com.sarkaritaiyaari.backend.dto;

import java.util.List;

/**
 * The Practice Result screen's "AI Feedback" tab — request/response shapes for
 * {@code POST /api/practice-sessions/{id}/analysis-feedback}. Mirrors
 * {@code packages/core/src/analytics/practiceResultAnalytics.ts}'s
 * {@code CompactPracticeResultInsightPayload} field-for-field — the mobile client computes that
 * shape entirely on-device (deterministic, no AI) and sends it verbatim; see
 * {@code PersonalNarrativeService}'s own doc comment for why context arriving from the client is
 * trusted rather than re-derived server-side.
 */
public final class PracticeResultInsightDtos {

    private PracticeResultInsightDtos() {
    }

    public record SubtopicSnapshotDto(
            String name,
            int attempted,
            int accuracyPercent,
            Integer averageTimeMs,
            int incorrectCount,
            int highTimeCount,
            int fastAccurateCount,
            String performanceLabel) {
    }

    public record FlaggedQuestionDto(
            int questionNumber,
            int timeMs,
            Boolean isCorrect,
            String subtopicName) {
    }

    public record PreviousPerformanceDto(
            boolean available,
            Integer previousAccuracyPercent,
            Integer currentAccuracyPercent,
            String trend) {
    }

    public record PracticeResultInsightRequest(
            String examCode,
            String subjectName,
            String topicName,
            String levelLabel,
            int accuracyPercent,
            int questionsAttempted,
            int correctCount,
            int incorrectCount,
            Integer totalTimeMs,
            Integer averageTimeMs,
            List<SubtopicSnapshotDto> subtopics,
            List<FlaggedQuestionDto> highTimeQuestions,
            List<FlaggedQuestionDto> fastAccurateQuestions,
            PreviousPerformanceDto previousPerformance,
            String preferredLanguage) {
    }

    /**
     * Every field is {@code null} together on disabled/failed-validation/provider error — never a
     * partial payload, and never a 4xx/5xx for "the model declined" — matching the router's own
     * "a tier failure never becomes a caller-visible error" rule.
     */
    public record PracticeResultInsightResponse(
            String summary,
            List<String> strengths,
            List<String> weakAreas,
            String timeInsight,
            String recommendation,
            String recommendedAction) {

        public static PracticeResultInsightResponse empty() {
            return new PracticeResultInsightResponse(null, null, null, null, null, null);
        }
    }
}
