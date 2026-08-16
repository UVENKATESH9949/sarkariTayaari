package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

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

    @Column(name = "selected_index", nullable = false)
    private int selectedIndex;

    @Column(name = "correct_index", nullable = false)
    private int correctIndex;

    @Column(name = "is_correct", nullable = false)
    private boolean correct;

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public UserPracticeSession getSession() { return session; }
    public void setSession(UserPracticeSession session) { this.session = session; }

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
