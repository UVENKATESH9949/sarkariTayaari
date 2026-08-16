package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

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

    @Column(name = "correct_index", nullable = false)
    private int correctIndex;

    @Column(name = "marked_for_review", nullable = false)
    private boolean markedForReview;

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

    public int getCorrectIndex() { return correctIndex; }
    public void setCorrectIndex(int correctIndex) { this.correctIndex = correctIndex; }

    public boolean isMarkedForReview() { return markedForReview; }
    public void setMarkedForReview(boolean markedForReview) { this.markedForReview = markedForReview; }
}
