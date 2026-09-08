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
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * One student's diagnosed health for one topic (Weakness Radar v1 — see
 * {@code tasks/TASK-2201-weakness-radar.md}).
 *
 * <p><strong>This is a cache, not a record.</strong> Every field below is derived from
 * {@code user_practice_session_results} and {@code user_mock_attempt_results}, which stay the
 * untouched source of truth. A row may be deleted and rebuilt at any moment with no loss,
 * which is what makes the supplied §19 requirement — recompute historical health after a
 * formula change — a version bump rather than a data migration.
 *
 * <p>Not synced to devices as mutable state, so it needs none of the last-write-wins
 * machinery {@link UserBookmark} and {@link UserTopicProgress} carry: there is no
 * {@code isSynced}, no tombstone and no {@code updatedAt} to compare. A device holds a
 * read-only copy for offline display and never writes back. That is the entire reason this is
 * a separate table from {@code user_topic_progress} rather than more columns on it — one is
 * bidirectional student state, the other is a server-derived opinion.
 *
 * <p>Id is the derived {@code "userId:topicId"} string, the same convention as
 * {@code user_bookmarks}, {@code user_topic_progress} and {@code exam_topics} — see ADR-005
 * for why a JPA {@code @IdClass} composite is avoided in this codebase.
 */
@Entity
@Table(name = "user_topic_health")
public class UserTopicHealth {

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /**
     * A real association rather than a bare UUID, for the same reason
     * {@link UserTopicProgress#getTopic()} is one: every read needs the topic's name and its
     * subject, and the FK stops a stale row outliving the topic it describes.
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "topic_id", nullable = false)
    private Topic topic;

    /** Which formula produced everything below. See {@code TopicHealthService}. */
    @Column(name = "algorithm_version", nullable = false, length = 30)
    private String algorithmVersion;

    @Column(name = "health_score", nullable = false)
    private BigDecimal healthScore;

    /**
     * Independent of {@link #healthScore}, per §11 — the same health of 50 means something
     * different at confidence 35 than at 92, and collapsing them would let the radar
     * recommend a weakness it has no real basis for.
     */
    @Column(name = "confidence_score", nullable = false)
    private BigDecimal confidenceScore;

    @Enumerated(EnumType.STRING)
    @Column(name = "state", nullable = false, length = 24)
    private TopicHealthState state;

    @Enumerated(EnumType.STRING)
    @Column(name = "trend_direction", nullable = false, length = 24)
    private PerformanceTrend trendDirection = PerformanceTrend.NOT_ENOUGH_DATA;

    /** Recent accuracy minus historical, in percentage points. Null when incomparable. */
    @Column(name = "trend_delta")
    private BigDecimal trendDelta;

    @Enumerated(EnumType.STRING)
    @Column(name = "evidence_level", nullable = false, length = 24)
    private EvidenceLevel evidenceLevel = EvidenceLevel.INSUFFICIENT_DATA;

    @Column(name = "attempted_count", nullable = false)
    private int attemptedCount;

    @Column(name = "correct_count", nullable = false)
    private int correctCount;

    @Column(name = "recent_attempted_count", nullable = false)
    private int recentAttemptedCount;

    @Column(name = "recent_accuracy")
    private BigDecimal recentAccuracy;

    @Column(name = "historical_accuracy")
    private BigDecimal historicalAccuracy;

    @Column(name = "pyq_attempted_count", nullable = false)
    private int pyqAttemptedCount;

    @Column(name = "pyq_accuracy")
    private BigDecimal pyqAccuracy;

    @Column(name = "consistency_score")
    private BigDecimal consistencyScore;

    /**
     * Always null under {@code TOPIC_HEALTH_V1}: no expected-time benchmark exists anywhere in
     * this schema, and §9 forbids inventing one. The column exists so the shape does not
     * change when benchmarks become real. Readers must render null as "not available", never
     * as an average pace.
     */
    @Column(name = "speed_ratio")
    private BigDecimal speedRatio;

    /**
     * §22 auditability, same role as {@link TopicPriority#getInputs()}: each component score
     * and the weight actually applied to it after renormalisation. This is what makes "why
     * does the app say I'm weak in this topic?" answerable without re-running the scorer.
     */
    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "inputs")
    private Map<String, Object> inputs;

    @Column(name = "last_attempt_at")
    private OffsetDateTime lastAttemptAt;

    /**
     * The newest attempt included in this computation.
     *
     * <p>The staleness check, and the reason this feature needs no dirty flag, database
     * trigger or scheduled job: a read compares the student's newest attempt against this and
     * recomputes only when there is genuinely something new. An in-process scheduler was
     * ruled out for this project once already — it is silently dead on Cloud Run's
     * scale-to-zero deployment (see {@code ReminderService}).
     */
    @Column(name = "evidence_through_at", nullable = false)
    private OffsetDateTime evidenceThroughAt;

    @Column(name = "computed_at", nullable = false)
    private OffsetDateTime computedAt;

    /** Keeps the synthetic key derivable rather than arbitrary, same as UserTopicProgress. */
    public static String idFor(UUID userId, UUID topicId) {
        return userId + ":" + topicId;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public User getUser() { return user; }
    public void setUser(User user) { this.user = user; }

    public Topic getTopic() { return topic; }
    public void setTopic(Topic topic) { this.topic = topic; }

    public String getAlgorithmVersion() { return algorithmVersion; }
    public void setAlgorithmVersion(String algorithmVersion) { this.algorithmVersion = algorithmVersion; }

    public BigDecimal getHealthScore() { return healthScore; }
    public void setHealthScore(BigDecimal healthScore) { this.healthScore = healthScore; }

    public BigDecimal getConfidenceScore() { return confidenceScore; }
    public void setConfidenceScore(BigDecimal confidenceScore) { this.confidenceScore = confidenceScore; }

    public TopicHealthState getState() { return state; }
    public void setState(TopicHealthState state) { this.state = state; }

    public PerformanceTrend getTrendDirection() { return trendDirection; }
    public void setTrendDirection(PerformanceTrend trendDirection) { this.trendDirection = trendDirection; }

    public BigDecimal getTrendDelta() { return trendDelta; }
    public void setTrendDelta(BigDecimal trendDelta) { this.trendDelta = trendDelta; }

    public EvidenceLevel getEvidenceLevel() { return evidenceLevel; }
    public void setEvidenceLevel(EvidenceLevel evidenceLevel) { this.evidenceLevel = evidenceLevel; }

    public int getAttemptedCount() { return attemptedCount; }
    public void setAttemptedCount(int attemptedCount) { this.attemptedCount = attemptedCount; }

    public int getCorrectCount() { return correctCount; }
    public void setCorrectCount(int correctCount) { this.correctCount = correctCount; }

    public int getRecentAttemptedCount() { return recentAttemptedCount; }
    public void setRecentAttemptedCount(int recentAttemptedCount) { this.recentAttemptedCount = recentAttemptedCount; }

    public BigDecimal getRecentAccuracy() { return recentAccuracy; }
    public void setRecentAccuracy(BigDecimal recentAccuracy) { this.recentAccuracy = recentAccuracy; }

    public BigDecimal getHistoricalAccuracy() { return historicalAccuracy; }
    public void setHistoricalAccuracy(BigDecimal historicalAccuracy) { this.historicalAccuracy = historicalAccuracy; }

    public int getPyqAttemptedCount() { return pyqAttemptedCount; }
    public void setPyqAttemptedCount(int pyqAttemptedCount) { this.pyqAttemptedCount = pyqAttemptedCount; }

    public BigDecimal getPyqAccuracy() { return pyqAccuracy; }
    public void setPyqAccuracy(BigDecimal pyqAccuracy) { this.pyqAccuracy = pyqAccuracy; }

    public BigDecimal getConsistencyScore() { return consistencyScore; }
    public void setConsistencyScore(BigDecimal consistencyScore) { this.consistencyScore = consistencyScore; }

    public BigDecimal getSpeedRatio() { return speedRatio; }
    public void setSpeedRatio(BigDecimal speedRatio) { this.speedRatio = speedRatio; }

    public Map<String, Object> getInputs() { return inputs; }
    public void setInputs(Map<String, Object> inputs) { this.inputs = inputs; }

    public OffsetDateTime getLastAttemptAt() { return lastAttemptAt; }
    public void setLastAttemptAt(OffsetDateTime lastAttemptAt) { this.lastAttemptAt = lastAttemptAt; }

    public OffsetDateTime getEvidenceThroughAt() { return evidenceThroughAt; }
    public void setEvidenceThroughAt(OffsetDateTime evidenceThroughAt) { this.evidenceThroughAt = evidenceThroughAt; }

    public OffsetDateTime getComputedAt() { return computedAt; }
    public void setComputedAt(OffsetDateTime computedAt) { this.computedAt = computedAt; }
}
