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

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

/** A completed practice session, uploaded from a device. Id is the device's own id. */
@Entity
@Table(name = "user_practice_sessions")
public class UserPracticeSession {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(name = "completed_at", nullable = false)
    private OffsetDateTime completedAt;

    @Column(name = "exam_label")
    private String examLabel;

    @Column(name = "subject_name")
    private String subjectName;

    @Column(name = "topic_name")
    private String topicName;

    @Column(name = "level_label")
    private String levelLabel;

    @Column(name = "correct_count", nullable = false)
    private int correctCount;

    @Column(name = "total_count", nullable = false)
    private int totalCount;

    @Column(name = "uploaded_at", nullable = false)
    private OffsetDateTime uploadedAt = OffsetDateTime.now();

    /* ------------------------------------------------- Session timing/context (V47, TASK-2801)
     * All four are recorded on the device today and, before V47, never left it -- so a practice
     * session's real duration and exam were lost on a device change and no server-side study-time
     * figure was possible. All nullable: absent from any client older than V47, and NULL means
     * "not recorded", never zero. */

    /** When the student started answering. Null for every session uploaded before V47. */
    @Column(name = "started_at")
    private OffsetDateTime startedAt;

    /** Elapsed wall-clock time for the session. See {@link #startedAt} for the null rule. */
    @Column(name = "duration_ms")
    private Long durationMs;

    /**
     * How many questions the set OFFERED, which may exceed {@code totalCount} because a student
     * may finish early. Never a denominator -- answering 15 of 17 attempted is 88% accuracy, not
     * 30%. Display and coverage only.
     */
    @Column(name = "available_count")
    private Integer availableCount;

    /** The exam being practised for. Null for the "All Government Exams" shortcut, which spans every exam. */
    @Column(name = "exam_code", length = 30)
    private String examCode;

    /** Phase 7.1 -- opportunistic cache of a generated SESSION_FEEDBACK narrative. Null means
     *  "never generated (or the session synced after the student already saw one built purely
     *  from their device's own local cache)" -- never a required backfill. */
    @Column(name = "feedback_narrative")
    private String feedbackNarrative;

    @Column(name = "feedback_generated_at")
    private OffsetDateTime feedbackGeneratedAt;

    @OneToMany(mappedBy = "session", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    @OrderBy("orderIndex ASC")
    private List<UserPracticeSessionResult> results = new ArrayList<>();

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public OffsetDateTime getStartedAt() { return startedAt; }
    public void setStartedAt(OffsetDateTime startedAt) { this.startedAt = startedAt; }

    public Long getDurationMs() { return durationMs; }
    public void setDurationMs(Long durationMs) { this.durationMs = durationMs; }

    public Integer getAvailableCount() { return availableCount; }
    public void setAvailableCount(Integer availableCount) { this.availableCount = availableCount; }

    public String getExamCode() { return examCode; }
    public void setExamCode(String examCode) { this.examCode = examCode; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

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

    public OffsetDateTime getUploadedAt() { return uploadedAt; }
    public void setUploadedAt(OffsetDateTime uploadedAt) { this.uploadedAt = uploadedAt; }

    public List<UserPracticeSessionResult> getResults() { return results; }
    public void setResults(List<UserPracticeSessionResult> results) { this.results = results; }

    public String getFeedbackNarrative() { return feedbackNarrative; }
    public void setFeedbackNarrative(String feedbackNarrative) { this.feedbackNarrative = feedbackNarrative; }

    public OffsetDateTime getFeedbackGeneratedAt() { return feedbackGeneratedAt; }
    public void setFeedbackGeneratedAt(OffsetDateTime feedbackGeneratedAt) { this.feedbackGeneratedAt = feedbackGeneratedAt; }
}
