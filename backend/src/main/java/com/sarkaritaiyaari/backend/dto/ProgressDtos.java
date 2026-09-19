package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Shapes for uploading and restoring a student's history.
 *
 * Ids come from the device and are used as-is, which is what makes an upload safe to
 * retry: sending the same session twice overwrites rather than duplicates.
 */
public final class ProgressDtos {

    private ProgressDtos() {
    }

    /* ------------------------------------------------------------------- upload */

    public static class SyncRequest {
        @Valid
        private List<PracticeSession> practiceSessions = List.of();

        @Valid
        private List<MockAttempt> mockAttempts = List.of();

        public List<PracticeSession> getPracticeSessions() { return practiceSessions; }
        public void setPracticeSessions(List<PracticeSession> practiceSessions) {
            this.practiceSessions = practiceSessions == null ? List.of() : practiceSessions;
        }

        public List<MockAttempt> getMockAttempts() { return mockAttempts; }
        public void setMockAttempts(List<MockAttempt> mockAttempts) {
            this.mockAttempts = mockAttempts == null ? List.of() : mockAttempts;
        }
    }

    public static class PracticeSession {
        @NotBlank private String id;
        @NotNull private OffsetDateTime completedAt;
        /**
         * Session timing and exam context (V47, TASK-2801). All four are optional: a client built
         * before that release omits them, and absence means "not recorded", never zero — the same
         * rule {@code timeMs} follows. The device has recorded all four since Doc 2 §7 and simply
         * never sent them, so a practice session's real duration was lost on a device change and
         * no server-side study-time figure was possible.
         */
        private OffsetDateTime startedAt;
        private Long durationMs;
        /** Questions OFFERED, which may exceed {@code totalCount} when the student finished early. Never a denominator. */
        private Integer availableCount;
        /** Null for the "All Government Exams" shortcut, which is not attributable to one exam. */
        private String examCode;
        private String examLabel;
        private String subjectName;
        private String topicName;
        private String levelLabel;
        private int correctCount;
        private int totalCount;
        @Valid private List<PracticeResult> results = List.of();

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public OffsetDateTime getCompletedAt() { return completedAt; }
        public void setCompletedAt(OffsetDateTime completedAt) { this.completedAt = completedAt; }
        public OffsetDateTime getStartedAt() { return startedAt; }
        public void setStartedAt(OffsetDateTime startedAt) { this.startedAt = startedAt; }
        public Long getDurationMs() { return durationMs; }
        public void setDurationMs(Long durationMs) { this.durationMs = durationMs; }
        public Integer getAvailableCount() { return availableCount; }
        public void setAvailableCount(Integer availableCount) { this.availableCount = availableCount; }
        public String getExamCode() { return examCode; }
        public void setExamCode(String examCode) { this.examCode = examCode; }
        public String getExamLabel() { return examLabel; }
        public void setExamLabel(String examLabel) { this.examLabel = examLabel; }
        public String getSubjectName() { return subjectName; }
        public void setSubjectName(String subjectName) { this.subjectName = subjectName; }
        public String getTopicName() { return topicName; }
        public void setTopicName(String topicName) { this.topicName = topicName; }
        public String getLevelLabel() { return levelLabel; }
        public void setLevelLabel(String levelLabel) { this.levelLabel = levelLabel; }
        public int getCorrectCount() { return correctCount; }
        public void setCorrectCount(int correctCount) { this.correctCount = correctCount; }
        public int getTotalCount() { return totalCount; }
        public void setTotalCount(int totalCount) { this.totalCount = totalCount; }
        public List<PracticeResult> getResults() { return results; }
        public void setResults(List<PracticeResult> results) { this.results = results == null ? List.of() : results; }
    }

    public static class PracticeResult {
        private int orderIndex;
        @NotNull private UUID questionId;
        /** Nullable since V26 — null for MULTIPLE_CHOICE/TRUE_FALSE, which have no single index. */
        private Integer selectedIndex;
        private Integer correctIndex;
        private boolean correct;
        /**
         * Optional per-question time in milliseconds (V24). Absent from older clients, and
         * absent means unknown -- see UserPracticeSessionResult.timeMs.
         */
        private Integer timeMs;

        /* -------------------------- Response model (V26, TASK-2301 Phase P2 Wave A) */

        /** Absent from a client that predates V26 — the server defaults it to "SINGLE_CHOICE". */
        private String questionType;
        private Map<String, Object> response;
        private String outcome;
        private BigDecimal scoreFraction;

        public int getOrderIndex() { return orderIndex; }
        public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }
        public UUID getQuestionId() { return questionId; }
        public void setQuestionId(UUID questionId) { this.questionId = questionId; }
        public Integer getSelectedIndex() { return selectedIndex; }
        public void setSelectedIndex(Integer selectedIndex) { this.selectedIndex = selectedIndex; }
        public Integer getCorrectIndex() { return correctIndex; }
        public void setCorrectIndex(Integer correctIndex) { this.correctIndex = correctIndex; }
        public boolean isCorrect() { return correct; }
        public void setCorrect(boolean correct) { this.correct = correct; }
        public Integer getTimeMs() { return timeMs; }
        public void setTimeMs(Integer timeMs) { this.timeMs = timeMs; }
        public String getQuestionType() { return questionType; }
        public void setQuestionType(String questionType) { this.questionType = questionType; }
        public Map<String, Object> getResponse() { return response; }
        public void setResponse(Map<String, Object> response) { this.response = response; }
        public String getOutcome() { return outcome; }
        public void setOutcome(String outcome) { this.outcome = outcome; }
        public BigDecimal getScoreFraction() { return scoreFraction; }
        public void setScoreFraction(BigDecimal scoreFraction) { this.scoreFraction = scoreFraction; }
    }

    public static class MockAttempt {
        @NotBlank private String id;
        private String examCode;
        private String examLabel;
        @NotNull private OffsetDateTime startedAt;
        @NotNull private OffsetDateTime completedAt;
        private int durationSeconds;
        private int timeTakenSeconds;
        private BigDecimal marksCorrect = BigDecimal.ZERO;
        private BigDecimal marksWrong = BigDecimal.ZERO;
        private BigDecimal totalMarksScored = BigDecimal.ZERO;
        private int correctCount;
        private int wrongCount;
        private int unattemptedCount;
        private int totalQuestions;
        @Valid private List<MockResult> results = List.of();

        public String getId() { return id; }
        public void setId(String id) { this.id = id; }
        public String getExamCode() { return examCode; }
        public void setExamCode(String examCode) { this.examCode = examCode; }
        public String getExamLabel() { return examLabel; }
        public void setExamLabel(String examLabel) { this.examLabel = examLabel; }
        public OffsetDateTime getStartedAt() { return startedAt; }
        public void setStartedAt(OffsetDateTime startedAt) { this.startedAt = startedAt; }
        public OffsetDateTime getCompletedAt() { return completedAt; }
        public void setCompletedAt(OffsetDateTime completedAt) { this.completedAt = completedAt; }
        public int getDurationSeconds() { return durationSeconds; }
        public void setDurationSeconds(int durationSeconds) { this.durationSeconds = durationSeconds; }
        public int getTimeTakenSeconds() { return timeTakenSeconds; }
        public void setTimeTakenSeconds(int timeTakenSeconds) { this.timeTakenSeconds = timeTakenSeconds; }
        public BigDecimal getMarksCorrect() { return marksCorrect; }
        public void setMarksCorrect(BigDecimal v) { this.marksCorrect = v == null ? BigDecimal.ZERO : v; }
        public BigDecimal getMarksWrong() { return marksWrong; }
        public void setMarksWrong(BigDecimal v) { this.marksWrong = v == null ? BigDecimal.ZERO : v; }
        public BigDecimal getTotalMarksScored() { return totalMarksScored; }
        public void setTotalMarksScored(BigDecimal v) { this.totalMarksScored = v == null ? BigDecimal.ZERO : v; }
        public int getCorrectCount() { return correctCount; }
        public void setCorrectCount(int correctCount) { this.correctCount = correctCount; }
        public int getWrongCount() { return wrongCount; }
        public void setWrongCount(int wrongCount) { this.wrongCount = wrongCount; }
        public int getUnattemptedCount() { return unattemptedCount; }
        public void setUnattemptedCount(int unattemptedCount) { this.unattemptedCount = unattemptedCount; }
        public int getTotalQuestions() { return totalQuestions; }
        public void setTotalQuestions(int totalQuestions) { this.totalQuestions = totalQuestions; }
        public List<MockResult> getResults() { return results; }
        public void setResults(List<MockResult> results) { this.results = results == null ? List.of() : results; }
    }

    public static class MockResult {
        private int orderIndex;
        private String subjectName;
        @NotNull private UUID questionId;
        /** null = left unattempted (or a MULTIPLE_CHOICE/TRUE_FALSE answer, which has no single index). */
        private Integer selectedIndex;
        /** Nullable since V26 — no meaning for MULTIPLE_CHOICE/TRUE_FALSE. */
        private Integer correctIndex;
        private boolean markedForReview;
        /** Optional per-question time in milliseconds (V24), same rules as PracticeResult. */
        private Integer timeMs;

        /* -------------------------- Response model (V26, TASK-2301 Phase P2 Wave A) */

        private String questionType;
        private Map<String, Object> response;
        private String outcome;
        private BigDecimal scoreFraction;

        public int getOrderIndex() { return orderIndex; }
        public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }
        public String getSubjectName() { return subjectName; }
        public void setSubjectName(String subjectName) { this.subjectName = subjectName; }
        public UUID getQuestionId() { return questionId; }
        public void setQuestionId(UUID questionId) { this.questionId = questionId; }
        public Integer getSelectedIndex() { return selectedIndex; }
        public void setSelectedIndex(Integer selectedIndex) { this.selectedIndex = selectedIndex; }
        public Integer getCorrectIndex() { return correctIndex; }
        public void setCorrectIndex(Integer correctIndex) { this.correctIndex = correctIndex; }
        public boolean isMarkedForReview() { return markedForReview; }
        public void setMarkedForReview(boolean markedForReview) { this.markedForReview = markedForReview; }
        public Integer getTimeMs() { return timeMs; }
        public void setTimeMs(Integer timeMs) { this.timeMs = timeMs; }
        public String getQuestionType() { return questionType; }
        public void setQuestionType(String questionType) { this.questionType = questionType; }
        public Map<String, Object> getResponse() { return response; }
        public void setResponse(Map<String, Object> response) { this.response = response; }
        public String getOutcome() { return outcome; }
        public void setOutcome(String outcome) { this.outcome = outcome; }
        public BigDecimal getScoreFraction() { return scoreFraction; }
        public void setScoreFraction(BigDecimal scoreFraction) { this.scoreFraction = scoreFraction; }
    }

    /* ----------------------------------------------------------------- responses */

    /**
     * @param rejectedPracticeSessionIds ids skipped because they already belong to a different
     *                                   account. Almost always empty. A client that predates this
     *                                   field simply ignores it; a newer one can surface or re-key
     *                                   the affected rows rather than retrying them forever.
     *                                   See {@code ProgressService.upload}.
     */
    public record SyncResponse(int practiceSessionsStored, int mockAttemptsStored,
                               List<String> rejectedPracticeSessionIds,
                               List<String> rejectedMockAttemptIds) {
    }

    /** Everything this user has, for rebuilding a fresh install. */
    public record RestoreResponse(
            List<PracticeSession> practiceSessions,
            List<MockAttempt> mockAttempts
    ) {
    }

    /* --------------------------------------------- Phase 3 (TASK-2601, web history/review) */

    /**
     * Same scalar fields as {@link PracticeSession}, deliberately without {@code results} —
     * a history LIST page has no use for every answer of every session on it, and that array
     * is exactly what would make a page of 20 sessions heavy. Full detail (with results) comes
     * from the single-session fetch instead.
     */
    public record PracticeSessionSummary(
            String id,
            OffsetDateTime completedAt,
            String examLabel,
            String subjectName,
            String topicName,
            String levelLabel,
            int correctCount,
            int totalCount
    ) {
    }

    /** Same reasoning as {@link PracticeSessionSummary}, for mock attempts. */
    public record MockAttemptSummary(
            String id,
            String examCode,
            String examLabel,
            OffsetDateTime startedAt,
            OffsetDateTime completedAt,
            int durationSeconds,
            int timeTakenSeconds,
            BigDecimal marksCorrect,
            BigDecimal marksWrong,
            BigDecimal totalMarksScored,
            int correctCount,
            int wrongCount,
            int unattemptedCount,
            int totalQuestions
    ) {
    }

    /**
     * One wrong practice answer, for Revise's "Wrong Answers" tab. No embedded question
     * content — the web client hydrates via {@code GET /api/questions/by-ids}, the same
     * general-purpose batch read used for session/attempt review and bookmarks.
     */
    public record WrongAnswerRow(
            UUID questionId,
            String subjectName,
            String topicName,
            OffsetDateTime completedAt,
            String questionType,
            Map<String, Object> response,
            Integer selectedIndex,
            Integer correctIndex
    ) {
    }
}
