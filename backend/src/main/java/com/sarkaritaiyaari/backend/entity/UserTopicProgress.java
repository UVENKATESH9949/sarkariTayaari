package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One student's mastery state for one topic (Epic L / TICKET-2105).
 *
 * <p>Mutable state, not an append-only event — modelled on {@link UserBookmark} rather than
 * {@link UserPracticeSession}. The same topic is practised repeatedly, possibly from more
 * than one device, so this row holds the current answer and conflicting devices are
 * resolved last-write-wins on {@code updatedAt}.
 *
 * <p>Id is the derived {@code "userId:topicId"} string, same convention as
 * {@code user_bookmarks} and {@code exam_topics} — see ADR-005 for why a JPA {@code @IdClass}
 * composite is avoided here (it produced real 500s on {@code user_bookmarks}).
 */
@Entity
@Table(name = "user_topic_progress")
public class UserTopicProgress {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /**
     * A real association rather than a bare UUID (unlike {@code UserBookmark.questionId}),
     * because the restore path needs the topic's name and subject to be useful on a fresh
     * install, and the FK also stops a device inventing topic ids.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "topic_id", nullable = false)
    private Topic topic;

    @Enumerated(EnumType.STRING)
    @Column(name = "state", nullable = false, length = 20)
    private TopicProgressState state = TopicProgressState.NOT_STARTED;

    @Column(name = "accuracy_percent")
    private BigDecimal accuracyPercent;

    @Column(name = "attempted_count", nullable = false)
    private int attemptedCount;

    @Column(name = "correct_count", nullable = false)
    private int correctCount;

    @Column(name = "total_time_ms", nullable = false)
    private long totalTimeMs;

    @Column(name = "last_practiced_at")
    private OffsetDateTime lastPracticedAt;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    /** Keeps the synthetic key derivable rather than arbitrary, same as ExamTopic.idFor. */
    public static String idFor(UUID userId, UUID topicId) {
        return userId + ":" + topicId;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public Topic getTopic() { return topic; }
    public void setTopic(Topic topic) { this.topic = topic; }

    public TopicProgressState getState() { return state; }
    public void setState(TopicProgressState state) { this.state = state; }

    public BigDecimal getAccuracyPercent() { return accuracyPercent; }
    public void setAccuracyPercent(BigDecimal accuracyPercent) { this.accuracyPercent = accuracyPercent; }

    public int getAttemptedCount() { return attemptedCount; }
    public void setAttemptedCount(int attemptedCount) { this.attemptedCount = attemptedCount; }

    public int getCorrectCount() { return correctCount; }
    public void setCorrectCount(int correctCount) { this.correctCount = correctCount; }

    public long getTotalTimeMs() { return totalTimeMs; }
    public void setTotalTimeMs(long totalTimeMs) { this.totalTimeMs = totalTimeMs; }

    public OffsetDateTime getLastPracticedAt() { return lastPracticedAt; }
    public void setLastPracticedAt(OffsetDateTime lastPracticedAt) { this.lastPracticedAt = lastPracticedAt; }

    public OffsetDateTime getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }
}
