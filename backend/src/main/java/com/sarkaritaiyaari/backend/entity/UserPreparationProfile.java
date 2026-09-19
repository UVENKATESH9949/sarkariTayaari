package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One account's preparation profile — what the student told onboarding about themselves
 * (TASK-3301, Phase 5, migration V48).
 *
 * <h2>Device-first, server-authoritative for planning only</h2>
 * Onboarding writes all of this to device-local {@code app_preferences} (mobile migration 0027)
 * <b>before</b> any sign-in, because accounts in this app are optional. That has not changed. This
 * row is the account-wide copy, and it exists because the daily planner runs on the server and
 * cannot budget a day without knowing how much time the student has (D5.1).
 *
 * <p>Two devices disagreeing resolve <b>last-write-wins</b> on {@code updatedAt}, the same rule
 * {@link UserBookmark} and {@code followed_exams} already use. {@code updatedAt} is
 * client-supplied: the device that made the edit is the one that knows when it happened, including
 * an edit made offline and uploaded days later.
 *
 * <p>Every field but the timestamps is nullable. A student can finish onboarding having skipped a
 * step, and an account that never onboarded has no row at all — which the planner reads as "no
 * stated study time" and budgets a declared default for, rather than refusing to plan.
 */
@Entity
@Table(name = "user_preparation_profiles")
public class UserPreparationProfile {

    /**
     * The user id itself — one profile per account, structural rather than enforced by a
     * constraint. A bare UUID rather than a {@code @OneToOne} association, and that is load-bearing
     * rather than stylistic: the first draft mapped it with {@code @MapsId}, which makes Hibernate
     * treat the user as part of this row's identity and cascade a persist into it. The {@code User}
     * handed in by {@code AuthService} was loaded in an earlier transaction and is therefore
     * detached, so every write failed with "detached entity passed to persist". Nothing here needs
     * to navigate to the user, and the database still enforces the foreign key.
     */
    @Id
    @Column(name = "user_id")
    private UUID userId;

    @Column(name = "display_name")
    private String displayName;

    @Column(name = "primary_exam_code")
    private String primaryExamCode;

    @Column(name = "exam_stage_id")
    private UUID examStageId;

    @Column(name = "target_year")
    private Integer targetYear;

    /** One of {@code PREPARATION_LEVELS} in packages/core. Validated in the service, not by a CHECK. */
    @Column(name = "preparation_level")
    private String preparationLevel;

    /**
     * One of {@code DAILY_STUDY_TIMES} in packages/core — a <b>band</b>, not a number of minutes.
     * The student answered "one to two hours", never "90 minutes", which is why the planner has to
     * declare what it budgeted and on what basis.
     */
    @Column(name = "daily_study_time")
    private String dailyStudyTime;

    @Column(name = "updated_at", nullable = false)
    private OffsetDateTime updatedAt;

    @Column(name = "created_at", nullable = false)
    private OffsetDateTime createdAt;

    public UUID getUserId() { return userId; }

    public void setUserId(UUID userId) { this.userId = userId; }

    public String getDisplayName() { return displayName; }

    public void setDisplayName(String displayName) { this.displayName = displayName; }

    public String getPrimaryExamCode() { return primaryExamCode; }

    public void setPrimaryExamCode(String primaryExamCode) { this.primaryExamCode = primaryExamCode; }

    public UUID getExamStageId() { return examStageId; }

    public void setExamStageId(UUID examStageId) { this.examStageId = examStageId; }

    public Integer getTargetYear() { return targetYear; }

    public void setTargetYear(Integer targetYear) { this.targetYear = targetYear; }

    public String getPreparationLevel() { return preparationLevel; }

    public void setPreparationLevel(String preparationLevel) { this.preparationLevel = preparationLevel; }

    public String getDailyStudyTime() { return dailyStudyTime; }

    public void setDailyStudyTime(String dailyStudyTime) { this.dailyStudyTime = dailyStudyTime; }

    public OffsetDateTime getUpdatedAt() { return updatedAt; }

    public void setUpdatedAt(OffsetDateTime updatedAt) { this.updatedAt = updatedAt; }

    public OffsetDateTime getCreatedAt() { return createdAt; }

    public void setCreatedAt(OffsetDateTime createdAt) { this.createdAt = createdAt; }
}
