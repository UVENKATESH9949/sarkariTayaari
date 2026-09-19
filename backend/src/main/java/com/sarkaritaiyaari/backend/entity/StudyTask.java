package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One thing the planner asked a student to do on one day (TASK-3301, Phase 5, migration V49).
 *
 * <h2>Why this is stored when the rest of the program is not</h2>
 * Phases 3, 4 and 7 all derive on read and store nothing, on purpose — a second stored layer is a
 * second thing that can go stale. This is the exception, and the reason is Phase 6 rather than
 * Phase 5: without a record of what was <b>assigned</b>, "no Percentage practice this week" is four
 * different situations (never assigned / ignored / abandoned / done offline and unsynced) that
 * nothing else in the schema can tell apart.
 *
 * <p>So this is not a cached answer that might drift from its inputs. It is a historical fact about
 * what the system asked for on a given day, which nothing can recompute afterwards — the same
 * category as an attempt row, not the same category as {@code user_topic_health}.
 *
 * <p>Topic and subject are {@code ON DELETE SET NULL} with their names denormalised beside them: if
 * a topic later leaves the catalogue, the fact that it was once assigned still happened, and the
 * record has to stay readable.
 */
@Entity
@Table(name = "study_tasks")
public class StudyTask {

    @Id
    private UUID id;

    /**
     * A bare UUID, not an association — same reason as {@code UserPreparationProfile.userId}: the
     * {@code User} reaching a service from {@code AuthService} is detached, and an association here
     * cascades a persist into it on write. Nothing needs to navigate to the user from a task, and
     * the foreign key is still enforced by the database.
     */
    @Column(name = "user_id", nullable = false)
    private UUID userId;

    /**
     * The calendar day this was assigned for, with the zone it was resolved in stored beside it.
     * A student who travels must not silently get two Mondays or none — the same reason
     * {@code /api/me/analytics} takes an optional IANA zone rather than assuming UTC.
     */
    @Column(name = "plan_date", nullable = false)
    private LocalDate planDate;

    @Column(name = "plan_zone", nullable = false)
    private String planZone;

    @Column(name = "exam_code", nullable = false)
    private String examCode;

    /** PRACTICE (from the roadmap) or REVISION (from the revision plan). */
    @Column(nullable = false)
    private String source;

    /** The {@code RecommendedAction} this resolves to. Stored as its name, never as a FK. */
    @Column(nullable = false)
    private String action;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "topic_id")
    private Topic topic;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "subject_id")
    private Subject subject;

    @Column(name = "topic_name")
    private String topicName;

    @Column(name = "subject_name")
    private String subjectName;

    @Column(name = "difficulty_code")
    private String difficultyCode;

    @Column(name = "planned_minutes", nullable = false)
    private int plannedMinutes;

    @Column(name = "planned_question_count")
    private Integer plannedQuestionCount;

    /**
     * Which tier of the workload ladder produced {@code plannedMinutes} — PERSONAL_TOPIC,
     * COHORT_TOPIC, COHORT_DIFFICULTY or DEFAULT. Carried through so a task is as honest about its
     * own numbers as the roadmap that produced it.
     */
    @Column(name = "estimate_source", nullable = false)
    private String estimateSource;

    @Column(name = "display_order", nullable = false)
    private int displayOrder;

    /** ASSIGNED / COMPLETED / SKIPPED. Only ASSIGNED is written by Phase 5. */
    @Column(nullable = false)
    private String status = "ASSIGNED";

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    @Column(name = "started_at")
    private OffsetDateTime startedAt;

    @Column(name = "completed_at")
    private OffsetDateTime completedAt;

    public UUID getId() { return id; }

    public void setId(UUID id) { this.id = id; }

    public UUID getUserId() { return userId; }

    public void setUserId(UUID userId) { this.userId = userId; }

    public LocalDate getPlanDate() { return planDate; }

    public void setPlanDate(LocalDate planDate) { this.planDate = planDate; }

    public String getPlanZone() { return planZone; }

    public void setPlanZone(String planZone) { this.planZone = planZone; }

    public String getExamCode() { return examCode; }

    public void setExamCode(String examCode) { this.examCode = examCode; }

    public String getSource() { return source; }

    public void setSource(String source) { this.source = source; }

    public String getAction() { return action; }

    public void setAction(String action) { this.action = action; }

    public Topic getTopic() { return topic; }

    public void setTopic(Topic topic) { this.topic = topic; }

    public Subject getSubject() { return subject; }

    public void setSubject(Subject subject) { this.subject = subject; }

    public String getTopicName() { return topicName; }

    public void setTopicName(String topicName) { this.topicName = topicName; }

    public String getSubjectName() { return subjectName; }

    public void setSubjectName(String subjectName) { this.subjectName = subjectName; }

    public String getDifficultyCode() { return difficultyCode; }

    public void setDifficultyCode(String difficultyCode) { this.difficultyCode = difficultyCode; }

    public int getPlannedMinutes() { return plannedMinutes; }

    public void setPlannedMinutes(int plannedMinutes) { this.plannedMinutes = plannedMinutes; }

    public Integer getPlannedQuestionCount() { return plannedQuestionCount; }

    public void setPlannedQuestionCount(Integer plannedQuestionCount) {
        this.plannedQuestionCount = plannedQuestionCount;
    }

    public String getEstimateSource() { return estimateSource; }

    public void setEstimateSource(String estimateSource) { this.estimateSource = estimateSource; }

    public int getDisplayOrder() { return displayOrder; }

    public void setDisplayOrder(int displayOrder) { this.displayOrder = displayOrder; }

    public String getStatus() { return status; }

    public void setStatus(String status) { this.status = status; }

    public OffsetDateTime getCreatedAt() { return createdAt; }

    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }

    public OffsetDateTime getStartedAt() { return startedAt; }

    public void setStartedAt(OffsetDateTime startedAt) { this.startedAt = startedAt; }

    public OffsetDateTime getCompletedAt() { return completedAt; }

    public void setCompletedAt(OffsetDateTime completedAt) { this.completedAt = completedAt; }
}
