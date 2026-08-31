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
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * How much a topic should be prioritised for one exam (Epic L / TICKET-2106 for the
 * computed side, TICKET-2107 for the override).
 *
 * <p>The shape is dictated by the supplied spec's §66: an admin override must
 * <strong>never overwrite the computed value in place</strong>. Hence three separate
 * fields rather than one mutable number —
 * {@link #systemPriority} (only the job writes it), {@link #adminOverride} (only an admin
 * writes it), and {@link #finalPriority} (what consumers sort by). An admin can be undone,
 * and a recomputation never silently erases editorial judgement.
 *
 * <p>{@link #finalPriority} is stored rather than derived on read so that every consumer
 * sorts by one column instead of re-implementing the precedence rule — the same duplication
 * that caused the marks-inheritance bug in the exam-structure work. The invariant
 * ({@code final == coalesce(override, system)}) is asserted by a CHECK in V15, so a writer
 * that forgets it fails loudly instead of quietly serving a wrong ordering.
 */
@Entity
@Table(name = "topic_priority")
public class TopicPriority {

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

    @Column(name = "system_priority")
    private BigDecimal systemPriority;

    /**
     * Null means "no override", which is deliberately different from an override of 0
     * ("explicitly deprioritise this topic"). A primitive or a defaulted 0 would make those
     * two indistinguishable.
     */
    @Column(name = "admin_override")
    private BigDecimal adminOverride;

    @Column(name = "final_priority")
    private BigDecimal finalPriority;

    @Column(name = "override_reason", columnDefinition = "text")
    private String overrideReason;

    /**
     * A bare id rather than a {@code @ManyToOne User}: this is an audit stamp read only by
     * the admin console, and an association would drag a lazy proxy into every priority
     * read on the student-facing path.
     */
    @Column(name = "override_by")
    private UUID overrideBy;

    @Column(name = "override_at")
    private OffsetDateTime overrideAt;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "inputs")
    private Map<String, Object> inputs;

    @Column(name = "computed_at", nullable = false)
    private OffsetDateTime computedAt;

    /** Version-scoped for the same reason as {@link TopicTrend#idFor}. */
    public static String idFor(String examCode, UUID topicId, String algorithmVersion) {
        return examCode + ":" + topicId + ":" + algorithmVersion;
    }

    /**
     * Keeps {@link #finalPriority} consistent with its two inputs. Every writer goes through
     * this rather than setting the three fields independently, so the V15 CHECK is a
     * backstop against a mistake rather than the only thing enforcing the rule.
     */
    public void recomputeFinalPriority() {
        this.finalPriority = adminOverride != null ? adminOverride : systemPriority;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }

    public Exam getExam() { return exam; }
    public void setExam(Exam exam) { this.exam = exam; }

    public Topic getTopic() { return topic; }
    public void setTopic(Topic topic) { this.topic = topic; }

    public String getAlgorithmVersion() { return algorithmVersion; }
    public void setAlgorithmVersion(String algorithmVersion) { this.algorithmVersion = algorithmVersion; }

    public BigDecimal getSystemPriority() { return systemPriority; }
    public void setSystemPriority(BigDecimal systemPriority) { this.systemPriority = systemPriority; }

    public BigDecimal getAdminOverride() { return adminOverride; }
    public void setAdminOverride(BigDecimal adminOverride) { this.adminOverride = adminOverride; }

    public BigDecimal getFinalPriority() { return finalPriority; }
    public void setFinalPriority(BigDecimal finalPriority) { this.finalPriority = finalPriority; }

    public String getOverrideReason() { return overrideReason; }
    public void setOverrideReason(String overrideReason) { this.overrideReason = overrideReason; }

    public UUID getOverrideBy() { return overrideBy; }
    public void setOverrideBy(UUID overrideBy) { this.overrideBy = overrideBy; }

    public OffsetDateTime getOverrideAt() { return overrideAt; }
    public void setOverrideAt(OffsetDateTime overrideAt) { this.overrideAt = overrideAt; }

    public Map<String, Object> getInputs() { return inputs; }
    public void setInputs(Map<String, Object> inputs) { this.inputs = inputs; }

    public OffsetDateTime getComputedAt() { return computedAt; }
    public void setComputedAt(OffsetDateTime computedAt) { this.computedAt = computedAt; }
}
