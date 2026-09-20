package com.sarkaritaiyaari.backend.dto;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Wire shapes for the daily plan (see {@code api/DAILY-PLAN.md}, TASK-3301, Phase 5).
 *
 * <p>Phases 4 and 7 say what there is to do and how much of it. This says <b>what to do today</b>,
 * in the time this student actually has — and, unlike every phase before it, what it produces is
 * written down (D5.2), because Phase 6 cannot tell an ignored task from one that was never assigned
 * without a record of what was asked for.
 */
public final class DailyPlanDtos {

    private DailyPlanDtos() {
    }

    /**
     * @param planDate       the day these tasks belong to, in {@code zone}
     * @param zone           the IANA zone the day was resolved in. Reported because "today" is not
     *                       a global fact, and a student who travels must not silently get two
     *                       Mondays or none
     * @param budget         how many minutes were budgeted, and on what basis
     * @param plannedMinutes what the tasks actually add up to. Deliberately reported separately
     *                       from the budget: a short day is a real answer, not a failure to fill
     * @param generated      true when this call created the plan, false when it returned the plan
     *                       already assigned for this day. A second read never re-plans — see
     *                       {@code DailyPlanService}
     * @param settledTaskCount how many tasks from earlier, already-closed days this call settled
     *                       into a real outcome. Reported rather than silent: it is the one moment
     *                       the system judges past work, and a caller seeing it move knows the
     *                       record caught up
     * @param tasks          in the order they were assigned
     */
    public record DailyPlanResponse(String examCode,
                                    LocalDate planDate,
                                    String zone,
                                    TimeBudget budget,
                                    int plannedMinutes,
                                    boolean generated,
                                    int settledTaskCount,
                                    List<PlannedTask> tasks) {
    }

    /**
     * What the planner had to work with.
     *
     * <p>The student never said "90 minutes" — onboarding asks for a <b>band</b>
     * ({@code UNDER_1H}, {@code ONE_TO_TWO}, …), so any minutes figure is the planner's own
     * assumption. Reporting the band beside the minutes is what makes that visible: a student who
     * chose "1–2 hours" and sees a 90-minute plan can see where 90 came from.
     *
     * @param dailyStudyTime the band the student chose, or null if they never onboarded or skipped
     *                       that step
     * @param minutes        what the planner budgeted
     * @param basis          {@code STATED_BAND} when derived from the student's own answer,
     *                       {@code DEFAULT} when no answer exists — an assumption, labelled
     */
    public record TimeBudget(String dailyStudyTime, int minutes, String basis) {
    }

    /**
     * @param source      {@code REVISION} (from the revision plan — work done and fading) or
     *                    {@code PRACTICE} (from the roadmap — work not yet done)
     * @param action      the {@code RecommendedAction} this resolves to
     * @param estimate    which tier of the workload ladder produced {@code plannedMinutes}, carried
     *                    through unchanged so a task is as honest about its numbers as the roadmap
     *                    that produced it
     * @param status      ASSIGNED while the day is open; COMPLETED / PARTIAL / SKIPPED once it has
     *                    closed and been settled from real attempts (TASK-3401). There is no
     *                    "mark as done" control — the outcome is inferred, because every answer has
     *                    carried its topic since V47
     * @param reason      one deterministic sentence saying why this task was assigned, fixed at
     *                    assignment time. Null for tasks assigned before V50
     * @param answeredToday how many questions the student actually answered on this topic during
     *                    this task's day — live for today, historical for a past day
     * @param accuracyToday accuracy across those answers, or null when none were answered. This is
     *                    what makes "a bad session changed tomorrow" inspectable rather than
     *                    something a reader has to take on trust
     */
    public record PlannedTask(UUID taskId,
                              int displayOrder,
                              String source,
                              String action,
                              UUID topicId,
                              String topicName,
                              UUID subjectId,
                              String subjectName,
                              String difficultyCode,
                              int plannedMinutes,
                              Integer plannedQuestionCount,
                              String estimate,
                              String status,
                              String reason,
                              long answeredToday,
                              Integer accuracyToday,
                              OffsetDateTime createdAt) {
    }
}
