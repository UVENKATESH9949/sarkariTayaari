package com.sarkaritaiyaari.backend.dto;

import com.sarkaritaiyaari.backend.dto.StudyRoadmapDtos.WorkloadEstimate;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Wire shapes for the revision plan (see {@code api/REVISION-PLAN.md}, TASK-3201, Phase 7 of the
 * personalization program).
 *
 * <h2>The one thing this adds</h2>
 * <pre>
 * WHAT      RecommendedAction's nine values        already shipped
 * HOW MUCH  ActionStepDto + Phase 4's minutes      already shipped
 * WHEN      this shape                             new
 * </pre>
 *
 * <h2>The intervals are borrowed, and the payload says so</h2>
 * {@link RevisionPlanResponse#intervalBasis()} names the model that produced every due date —
 * {@code SPACED_REPETITION_LADDER_V1}, whose 3/7/21/45-day rungs come from published
 * spaced-repetition research on other learners, <b>not</b> from this app's own students. It is
 * versioned for exactly that reason: when someone measures real retention here, replacing the
 * ladder is a version bump a consumer can see, not a silent change in what a due date means.
 */
public final class RevisionPlanDtos {

    private RevisionPlanDtos() {
    }

    /**
     * @param intervalBasis   which model produced the intervals, versioned
     * @param dueCount        topics due today or overdue
     * @param totalDueMinutes estimated minutes to clear everything currently due. Null when
     *                        nothing is due, which is a real answer rather than zero work
     * @param topics          ordered: most overdue first, then soonest due, then the unscheduled
     */
    public record RevisionPlanResponse(String examCode,
                                       String healthAlgorithmVersion,
                                       OffsetDateTime computedAt,
                                       String intervalBasis,
                                       int dueCount,
                                       Integer totalDueMinutes,
                                       List<RevisionTopic> topics) {
    }

    /**
     * One topic's revision timing.
     *
     * @param status              {@code DUE}, {@code NOT_DUE}, or {@code NOT_SCHEDULED}
     * @param notScheduledReason  why a topic has no due date — set only for NOT_SCHEDULED, and a
     *                            real answer rather than an error: a topic nobody has practised
     *                            has nothing to revise, and belongs to the roadmap's learning path
     * @param rung                1-4, which step of the ladder applied
     * @param rungReason          the state that selected it, so a due date is explicable without
     *                            reading the service
     * @param intervalDays        the rung's interval
     * @param dueAt               {@code lastPracticedAt + intervalDays}. Null when NOT_SCHEDULED
     * @param daysUntilDue        set only when NOT_DUE
     * @param daysOverdue         set only when DUE; 0 means due today
     * @param retest              what re-testing this topic resolves to. Null when NOT_SCHEDULED
     */
    public record RevisionTopic(UUID topicId,
                                String topicName,
                                UUID subjectId,
                                String subjectName,
                                String curriculumState,
                                String performanceState,
                                OffsetDateTime lastPracticedAt,
                                Integer daysSinceLastPractice,
                                String status,
                                String notScheduledReason,
                                Integer rung,
                                String rungReason,
                                Integer intervalDays,
                                OffsetDateTime dueAt,
                                Integer daysUntilDue,
                                Integer daysOverdue,
                                Double examPriority,
                                RetestPlan retest) {
    }

    /**
     * The instrument (D7.2): timed practice on this topic, which opens a screen the app already
     * has. Deliberately not a mock paper — a mock spans the whole syllabus and cannot be scheduled
     * as "re-test Percentages".
     *
     * @param questionCount    taken from the largest question-bearing step the radar already
     *                         recommends for this topic, so it agrees with the roadmap; when the
     *                         radar recommends none, a stated default, capped at what the bank
     *                         actually holds for this topic and exam
     * @param questionCountBasis {@code RECOMMENDED_STEP} or {@code DEFAULT} — the same discipline
     *                         {@link WorkloadEstimate#source()} applies to minutes
     */
    public record RetestPlan(String action,
                             int questionCount,
                             String questionCountBasis,
                             int estimatedMinutes,
                             WorkloadEstimate estimate) {
    }
}
