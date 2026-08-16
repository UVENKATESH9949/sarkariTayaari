package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

/** A completed mock test, uploaded from a device. Id is the device's own id. */
@Entity
@Table(name = "user_mock_attempts")
public class UserMockAttempt {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "exam_code")
    private String examCode;

    @Column(name = "exam_label")
    private String examLabel;

    @Column(name = "started_at", nullable = false)
    private OffsetDateTime startedAt;

    @Column(name = "completed_at", nullable = false)
    private OffsetDateTime completedAt;

    @Column(name = "duration_seconds", nullable = false)
    private int durationSeconds;

    @Column(name = "time_taken_seconds", nullable = false)
    private int timeTakenSeconds;

    @Column(name = "marks_correct", nullable = false)
    private BigDecimal marksCorrect;

    @Column(name = "marks_wrong", nullable = false)
    private BigDecimal marksWrong;

    @Column(name = "total_marks_scored", nullable = false)
    private BigDecimal totalMarksScored;

    @Column(name = "correct_count", nullable = false)
    private int correctCount;

    @Column(name = "wrong_count", nullable = false)
    private int wrongCount;

    @Column(name = "unattempted_count", nullable = false)
    private int unattemptedCount;

    @Column(name = "total_questions", nullable = false)
    private int totalQuestions;

    @Column(name = "uploaded_at", nullable = false)
    private OffsetDateTime uploadedAt = OffsetDateTime.now();

    @OneToMany(mappedBy = "attempt", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("orderIndex ASC")
    private List<UserMockAttemptResult> results = new ArrayList<>();

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

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
    public void setMarksCorrect(BigDecimal marksCorrect) { this.marksCorrect = marksCorrect; }

    public BigDecimal getMarksWrong() { return marksWrong; }
    public void setMarksWrong(BigDecimal marksWrong) { this.marksWrong = marksWrong; }

    public BigDecimal getTotalMarksScored() { return totalMarksScored; }
    public void setTotalMarksScored(BigDecimal totalMarksScored) { this.totalMarksScored = totalMarksScored; }

    public int getCorrectCount() { return correctCount; }
    public void setCorrectCount(int correctCount) { this.correctCount = correctCount; }

    public int getWrongCount() { return wrongCount; }
    public void setWrongCount(int wrongCount) { this.wrongCount = wrongCount; }

    public int getUnattemptedCount() { return unattemptedCount; }
    public void setUnattemptedCount(int unattemptedCount) { this.unattemptedCount = unattemptedCount; }

    public int getTotalQuestions() { return totalQuestions; }
    public void setTotalQuestions(int totalQuestions) { this.totalQuestions = totalQuestions; }

    public OffsetDateTime getUploadedAt() { return uploadedAt; }
    public void setUploadedAt(OffsetDateTime uploadedAt) { this.uploadedAt = uploadedAt; }

    public List<UserMockAttemptResult> getResults() { return results; }
    public void setResults(List<UserMockAttemptResult> results) { this.results = results; }
}
