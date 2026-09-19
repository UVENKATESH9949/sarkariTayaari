package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.util.Map;
import java.util.UUID;

/** One question within a mock attempt. selectedIndex is null when left unattempted. */
@Entity
@Table(name = "user_mock_attempt_results")
public class UserMockAttemptResult {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "attempt_id", nullable = false)
    private UserMockAttempt attempt;

    @Column(name = "order_index", nullable = false)
    private int orderIndex;

    @Column(name = "subject_name")
    private String subjectName;

    @Column(name = "question_id", nullable = false)
    private UUID questionId;

    @Column(name = "selected_index")
    private Integer selectedIndex;

    /** Nullable since V26 — no meaning for MULTIPLE_CHOICE/TRUE_FALSE, same reasoning as {@link UserPracticeSessionResult#getCorrectIndex()}. */
    @Column(name = "correct_index")
    private Integer correctIndex;

    @Column(name = "marked_for_review", nullable = false)
    private boolean markedForReview;

    /**
     * Milliseconds spent on this question, or null when the client did not record one.
     *
     * <p>Added by V24 for Weakness Radar. <strong>Null means unknown, never zero.</strong>
     * Every row uploaded before that release has none, and older clients still omit it, so a
     * reader that treated absence as a fast answer would manufacture a speed signal out of
     * nothing -- which is what the spec's §9 forbids. There is also no expected-time
     * benchmark in this schema yet, so nothing consumes this field in v1; it is captured now
     * so a later version has history to derive one from.
     */
    @Column(name = "time_ms")
    private Integer timeMs;

    /* ------------------------------ Response model (V26, TASK-2301 Phase P2 Wave A) */

    @JdbcTypeCode(SqlTypes.JSON)
    @Column
    private Map<String, Object> response;

    @Column(length = 20)
    private String outcome;

    @Column(name = "score_fraction", precision = 4, scale = 3)
    private BigDecimal scoreFraction;

    @Column(name = "question_type", length = 40)
    private String questionType;

    /* ------------------------------------------ Classification snapshot (V47, TASK-2801)
     * What this question WAS classified as at the moment it was answered, frozen here rather
     * than joined live from `questions` on every read.
     *
     * Without this, re-tagging a question retroactively rewrites every student's history: answers
     * given under one topic silently become answers under another, and any trend computed across
     * that edit moves for a reason that has nothing to do with the student. question_id below
     * stays the canonical reference to the question itself -- these four are a snapshot of its
     * classification, not a copy of its content.
     *
     * All nullable. NULL means "unknown" -- a row whose question was hard-deleted before the V47
     * backfill ran has no classification to recover, and a reader must render that as absent
     * rather than bucketing it as "Other".
     */

    @Column(name = "topic_id")
    private UUID topicId;

    @Column(name = "subject_id")
    private UUID subjectId;

    /** Matches {@code difficulty_levels.code} -- a stable code, never a display label. */
    @Column(name = "difficulty_code", length = 20)
    private String difficultyCode;

    /** Whether this was a previous-year question when answered. Boxed: null is "unknown", not false. */
    @Column(name = "is_pyq")
    private Boolean pyq;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public UserMockAttempt getAttempt() { return attempt; }
    public void setAttempt(UserMockAttempt attempt) { this.attempt = attempt; }

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

    public Map<String, Object> getResponse() { return response; }
    public void setResponse(Map<String, Object> response) { this.response = response; }

    public String getOutcome() { return outcome; }
    public void setOutcome(String outcome) { this.outcome = outcome; }

    public BigDecimal getScoreFraction() { return scoreFraction; }
    public void setScoreFraction(BigDecimal scoreFraction) { this.scoreFraction = scoreFraction; }

    public String getQuestionType() { return questionType; }
    public void setQuestionType(String questionType) { this.questionType = questionType; }

    public UUID getTopicId() { return topicId; }
    public void setTopicId(UUID topicId) { this.topicId = topicId; }

    public UUID getSubjectId() { return subjectId; }
    public void setSubjectId(UUID subjectId) { this.subjectId = subjectId; }

    public String getDifficultyCode() { return difficultyCode; }
    public void setDifficultyCode(String difficultyCode) { this.difficultyCode = difficultyCode; }

    public Boolean getPyq() { return pyq; }
    public void setPyq(Boolean pyq) { this.pyq = pyq; }
}
