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

/** One answered question within a practice session. */
@Entity
@Table(name = "user_practice_session_results")
public class UserPracticeSessionResult {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id", nullable = false)
    private UserPracticeSession session;

    @Column(name = "order_index", nullable = false)
    private int orderIndex;

    /** Only the id — the question text is rejoined from the synced bank. See V6. */
    @Column(name = "question_id", nullable = false)
    private UUID questionId;

    /**
     * Nullable since V26 (TASK-2301 Phase P2 Wave A) — a MULTIPLE_CHOICE/TRUE_FALSE answer
     * has no single index, so both this and {@link #correctIndex} are null for those types.
     * Still populated exactly as before for SINGLE_CHOICE/ASSERTION_REASON/
     * STATEMENT_COMBINATION, all three genuinely single-index answers.
     */
    @Column(name = "selected_index")
    private Integer selectedIndex;

    @Column(name = "correct_index")
    private Integer correctIndex;

    @Column(name = "is_correct", nullable = false)
    private boolean correct;

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

    /** e.g. {@code {"selectedOptions": [0, 2]}} — the generic, type-shaped answer. Null means unattempted. */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column
    private Map<String, Object> response;

    /** {@code QuestionEvaluator}'s outcome — CORRECT/INCORRECT/PARTIAL/UNATTEMPTED/PENDING_REVIEW. */
    @Column(length = 20)
    private String outcome;

    @Column(name = "score_fraction", precision = 4, scale = 3)
    private BigDecimal scoreFraction;

    /** What evaluated this row — backfilled to SINGLE_CHOICE for every row that predates V26. */
    @Column(name = "question_type", length = 40)
    private String questionType;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public UserPracticeSession getSession() { return session; }
    public void setSession(UserPracticeSession session) { this.session = session; }

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

    public Map<String, Object> getResponse() { return response; }
    public void setResponse(Map<String, Object> response) { this.response = response; }

    public String getOutcome() { return outcome; }
    public void setOutcome(String outcome) { this.outcome = outcome; }

    public BigDecimal getScoreFraction() { return scoreFraction; }
    public void setScoreFraction(BigDecimal scoreFraction) { this.scoreFraction = scoreFraction; }

    public String getQuestionType() { return questionType; }
    public void setQuestionType(String questionType) { this.questionType = questionType; }
}
