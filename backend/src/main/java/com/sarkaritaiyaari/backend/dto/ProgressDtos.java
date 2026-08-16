package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
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
        private int selectedIndex;
        private int correctIndex;
        private boolean correct;

        public int getOrderIndex() { return orderIndex; }
        public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }
        public UUID getQuestionId() { return questionId; }
        public void setQuestionId(UUID questionId) { this.questionId = questionId; }
        public int getSelectedIndex() { return selectedIndex; }
        public void setSelectedIndex(int selectedIndex) { this.selectedIndex = selectedIndex; }
        public int getCorrectIndex() { return correctIndex; }
        public void setCorrectIndex(int correctIndex) { this.correctIndex = correctIndex; }
        public boolean isCorrect() { return correct; }
        public void setCorrect(boolean correct) { this.correct = correct; }
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
        /** null = left unattempted. */
        private Integer selectedIndex;
        private int correctIndex;
        private boolean markedForReview;

        public int getOrderIndex() { return orderIndex; }
        public void setOrderIndex(int orderIndex) { this.orderIndex = orderIndex; }
        public String getSubjectName() { return subjectName; }
        public void setSubjectName(String subjectName) { this.subjectName = subjectName; }
        public UUID getQuestionId() { return questionId; }
        public void setQuestionId(UUID questionId) { this.questionId = questionId; }
        public Integer getSelectedIndex() { return selectedIndex; }
        public void setSelectedIndex(Integer selectedIndex) { this.selectedIndex = selectedIndex; }
        public int getCorrectIndex() { return correctIndex; }
        public void setCorrectIndex(int correctIndex) { this.correctIndex = correctIndex; }
        public boolean isMarkedForReview() { return markedForReview; }
        public void setMarkedForReview(boolean markedForReview) { this.markedForReview = markedForReview; }
    }

    /* ----------------------------------------------------------------- responses */

    public record SyncResponse(int practiceSessionsStored, int mockAttemptsStored) {
    }

    /** Everything this user has, for rebuilding a fresh install. */
    public record RestoreResponse(
            List<PracticeSession> practiceSessions,
            List<MockAttempt> mockAttempts
    ) {
    }
}
