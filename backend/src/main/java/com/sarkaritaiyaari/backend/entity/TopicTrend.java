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
 * A derived view of how much a topic actually matters for one exam, computed from
 * PYQ-tagged questions (Epic L / TICKET-2106).
 *
 * <p>Deliberately separate from {@link ExamTopic#getWeightagePercent()}, which is the
 * admin's curated figure. The supplied spec's §66 requires the human and the computed value
 * to stay distinguishable — collapsing them makes it impossible to tell which a
 * recommendation came from, and impossible to notice when the two disagree.
 *
 * <p>{@link #algorithmVersion} and {@link #inputs} exist for §65/§67 auditability: a stored
 * score has to remain explainable after the formula changes. Bumping the version and
 * recomputing leaves the old rows readable rather than silently rewriting history.
 */
@Entity
@Table(name = "topic_trend")
public class TopicTrend {

    /**
     * How a computed trend should be read. INSUFFICIENT_DATA is a real verdict, not an
     * error state: a topic with one tagged appearance genuinely has no trend, and reporting
     * "stable" there would be a fabrication the student cannot see through.
     */
    public enum Direction {
        RISING,
        STABLE,
        FALLING,
        INSUFFICIENT_DATA
    }

    @Id
    private String id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "exam_code", nullable = false)
    private Exam exam;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "topic_id", nullable = false)
    private Topic topic;

    @Column(name = "algorithm_version", nullable = false, length = 20)
    private String algorithmVersion;

    @Column(name = "window_from_year")
    private Integer windowFromYear;

    @Column(name = "window_to_year")
    private Integer windowToYear;

    @Column(name = "appearance_count", nullable = false)
    private int appearanceCount;

    @Column(name = "computed_weightage_percent")
    private BigDecimal computedWeightagePercent;

    @Enumerated(EnumType.STRING)
    @Column(name = "trend_direction", nullable = false, length = 20)
    private Direction trendDirection = Direction.INSUFFICIENT_DATA;

    @Column(name = "trend_score")
    private BigDecimal trendScore;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "inputs")
    private Map<String, Object> inputs;

    @Column(name = "computed_at", nullable = false)
    private OffsetDateTime computedAt;

    /**
     * Includes the algorithm version, unlike {@link ExamTopic#idFor}. Two versions of the
     * same (exam, topic) trend coexist by design — that is what makes a formula change
     * auditable — so the version has to be part of the identity.
     */
    public static String idFor(String examCode, UUID topicId, String algorithmVersion) {
        return examCode + ":" + topicId + ":" + algorithmVersion;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public Exam getExam() { return exam; }
    public void setExam(Exam exam) { this.exam = exam; }

    public Topic getTopic() { return topic; }
    public void setTopic(Topic topic) { this.topic = topic; }

    public String getAlgorithmVersion() { return algorithmVersion; }
    public void setAlgorithmVersion(String algorithmVersion) { this.algorithmVersion = algorithmVersion; }

    public Integer getWindowFromYear() { return windowFromYear; }
    public void setWindowFromYear(Integer windowFromYear) { this.windowFromYear = windowFromYear; }

    public Integer getWindowToYear() { return windowToYear; }
    public void setWindowToYear(Integer windowToYear) { this.windowToYear = windowToYear; }

    public int getAppearanceCount() { return appearanceCount; }
    public void setAppearanceCount(int appearanceCount) { this.appearanceCount = appearanceCount; }

    public BigDecimal getComputedWeightagePercent() { return computedWeightagePercent; }
    public void setComputedWeightagePercent(BigDecimal v) { this.computedWeightagePercent = v; }

    public Direction getTrendDirection() { return trendDirection; }
    public void setTrendDirection(Direction trendDirection) { this.trendDirection = trendDirection; }

    public BigDecimal getTrendScore() { return trendScore; }
    public void setTrendScore(BigDecimal trendScore) { this.trendScore = trendScore; }

    public Map<String, Object> getInputs() { return inputs; }
    public void setInputs(Map<String, Object> inputs) { this.inputs = inputs; }

    public OffsetDateTime getComputedAt() { return computedAt; }
    public void setComputedAt(OffsetDateTime computedAt) { this.computedAt = computedAt; }
}
