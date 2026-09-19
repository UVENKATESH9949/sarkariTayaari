package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.LearningStateDtos.TopicLearningState;
import com.sarkaritaiyaari.backend.dto.RevisionPlanDtos.RetestPlan;
import com.sarkaritaiyaari.backend.dto.RevisionPlanDtos.RevisionPlanResponse;
import com.sarkaritaiyaari.backend.dto.RevisionPlanDtos.RevisionTopic;
import com.sarkaritaiyaari.backend.dto.StudyRoadmapDtos.WorkloadEstimate;
import com.sarkaritaiyaari.backend.dto.WeaknessRadarDtos.ActionStepDto;
import com.sarkaritaiyaari.backend.dto.WeaknessRadarDtos.RadarTopic;
import com.sarkaritaiyaari.backend.entity.RecommendedAction;
import com.sarkaritaiyaari.backend.entity.TopicHealthState;
import com.sarkaritaiyaari.backend.entity.TopicProgressState;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.service.LearningStateService.AssembledState;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * When to come back to a topic, and what re-testing it means. TASK-3201, Phase 7 of the
 * personalization program.
 *
 * <p>The app already knew <i>what</i> to do about a topic ({@code RecommendedAction}'s nine values)
 * and, since Phase 4, <i>how much</i> of it. It has never known <b>when</b>. That is all this
 * service adds.
 *
 * <h2>The ladder (D7.1), and where its numbers come from</h2>
 * Intervals of <b>3 / 7 / 21 / 45 days</b>, selected per topic by how well the student currently
 * knows it. <b>These intervals are borrowed from published spaced-repetition research on other
 * learners, not measured on this product's students.</b> The recommendation at decision time was to
 * reuse {@link TopicHealthService}'s existing 45-day evidence half-life, which is at least this
 * app's own curve; the project owner chose the explicit ladder instead. That choice is recorded
 * here and in {@code tasks/TASK-3201-revision-and-assessment-timing.md} rather than left for a
 * reader to assume the numbers were derived from real retention data — they were not, and this
 * app's timing history is too young to have derived them.
 *
 * <p>{@code INTERVAL_BASIS} is versioned for exactly that reason: replacing the ladder with a
 * measured curve later is a visible version bump, not a silent change in what "due" means.
 *
 * <h2>Why there is no repetition counter (a deliberate deviation from SM-2)</h2>
 * Textbook spaced repetition advances an item one rung per successful review, which requires
 * storing a per-item counter. Here the rung is read from the student's <b>current measured
 * state</b> instead:
 *
 * <ul>
 *   <li>a topic that keeps going well climbs the ladder on its own, because its health rises;</li>
 *   <li>a topic that slips drops straight back to 3 days, without waiting for a review to fail;</li>
 *   <li>nothing is stored, so nothing can go stale (D7.3, following D4.1 and D3.6).</li>
 * </ul>
 *
 * The cost, stated plainly: this is not a strict per-item progression, so two students with
 * identical review histories but different current health get different intervals. That is the
 * intended behaviour — it is a ladder scaled by state, not SM-2.
 *
 * <p><b>This can write</b>, for the same reason {@link LearningStateService} can: the health model
 * recomputes lazily underneath.
 */
@Service
@Transactional
public class RevisionPlanService {

    /** Versioned, so a future measured curve replaces this visibly rather than silently. */
    public static final String INTERVAL_BASIS = "SPACED_REPETITION_LADDER_V1";

    public static final int RUNG_1_DAYS = 3;
    public static final int RUNG_2_DAYS = 7;
    public static final int RUNG_3_DAYS = 21;
    public static final int RUNG_4_DAYS = 45;

    /**
     * How many questions a re-test asks for when the radar recommends no question-bearing step for
     * that topic — a strong, mastered topic, typically. A stated constant, reported as
     * {@code DEFAULT} in {@link RetestPlan#questionCountBasis()} rather than passed off as derived.
     */
    public static final int DEFAULT_RETEST_QUESTIONS = 10;

    static final String REASON_NEVER_PRACTISED = "NEVER_PRACTISED";
    static final String REASON_NOT_ENOUGH_EVIDENCE = "NOT_ENOUGH_EVIDENCE";

    private final LearningStateService learningState;
    private final WorkloadEstimator estimator;

    public RevisionPlanService(LearningStateService learningState, WorkloadEstimator estimator) {
        this.learningState = learningState;
        this.estimator = estimator;
    }

    public RevisionPlanResponse planFor(User user, String examCode, OffsetDateTime now) {
        return planFrom(learningState.assemble(user, examCode, now),
                estimator.load(user.getId(), now), now);
    }

    /**
     * The same plan, built from state and timings a caller already has — see
     * {@code StudyRoadmapService.roadmapFrom} for why this overload exists.
     */
    public RevisionPlanResponse planFrom(AssembledState assembled,
                                         WorkloadEstimator.Timing timing,
                                         OffsetDateTime now) {
        Map<UUID, RadarTopic> radarByTopic = new HashMap<>();
        for (RadarTopic t : assembled.radar().topics()) {
            radarByTopic.put(t.topicId(), t);
        }

        List<RevisionTopic> topics = new ArrayList<>();
        for (TopicLearningState t : assembled.state().topics()) {
            // A topic the bank cannot test is not a revision candidate, whatever its state — the
            // same rule the roadmap applies, and for the same reason: the re-test has to open a
            // screen with questions behind it.
            if (t.questionCount() <= 0) continue;
            topics.add(schedule(t, radarByTopic.get(t.topicId()), timing, now));
        }

        topics.sort(ORDER);

        int dueCount = 0;
        int dueMinutes = 0;
        for (RevisionTopic t : topics) {
            if ("DUE".equals(t.status())) {
                dueCount++;
                if (t.retest() != null) dueMinutes += t.retest().estimatedMinutes();
            }
        }

        return new RevisionPlanResponse(
                assembled.state().examCode(),
                assembled.state().healthAlgorithmVersion(),
                assembled.state().computedAt(),
                INTERVAL_BASIS,
                dueCount,
                dueCount == 0 ? null : dueMinutes,
                topics);
    }

    /* ================================================================= one topic's scheduling */

    private RevisionTopic schedule(TopicLearningState t, RadarTopic radar,
                                   WorkloadEstimator.Timing timing, OffsetDateTime now) {
        // Prefer the health model's own recency; fall back to the device's curriculum ladder, which
        // can carry a practice the health window no longer covers.
        OffsetDateTime last = t.lastAttemptAt() != null
                ? t.lastAttemptAt()
                : t.curriculumLastPracticedAt();

        Rung rung = rungFor(t);

        if (last == null || rung == null) {
            /*
             * Not an error and not an empty slot: a topic nobody has practised has nothing to
             * revise, and one with too little evidence has nothing to revise *from*. Both belong to
             * the roadmap's learning path, and saying so is more useful than a fabricated due date.
             */
            String reason = last == null ? REASON_NEVER_PRACTISED : REASON_NOT_ENOUGH_EVIDENCE;
            return new RevisionTopic(t.topicId(), t.topicName(), t.subjectId(), t.subjectName(),
                    t.curriculumState(), t.performanceState(), last, daysSince(last, now),
                    "NOT_SCHEDULED", reason, null, null, null, null, null, null,
                    t.examPriority(), null);
        }

        OffsetDateTime dueAt = last.plusDays(rung.days());
        long daysToDue = wholeDaysBetween(now, dueAt);
        boolean due = !dueAt.isAfter(now);

        RetestPlan retest = retestFor(t, radar, timing);

        return new RevisionTopic(t.topicId(), t.topicName(), t.subjectId(), t.subjectName(),
                t.curriculumState(), t.performanceState(), last, daysSince(last, now),
                due ? "DUE" : "NOT_DUE", null,
                rung.number(), rung.reason(), rung.days(), dueAt,
                due ? null : (int) Math.max(0, daysToDue),
                due ? (int) Math.max(0, -daysToDue) : null,
                t.examPriority(), retest);
    }

    /** Which rung applies, or null when the topic is not a revision candidate at all. */
    static Rung rungFor(TopicLearningState t) {
        // Never measured, or measured and not yet judgeable: there is no verdict to keep fresh.
        if (t.performanceState() == null
                || TopicHealthState.INSUFFICIENT_DATA.name().equals(t.performanceState())) {
            return null;
        }

        String performance = t.performanceState();
        boolean mastered = TopicProgressState.MASTERED.name().equals(t.curriculumState());

        if (TopicHealthState.NEEDS_ATTENTION.name().equals(performance)
                || TopicHealthState.NEEDS_REVISION.name().equals(performance)) {
            return new Rung(1, RUNG_1_DAYS, "PERFORMANCE_" + performance);
        }
        if (TopicHealthState.DEVELOPING.name().equals(performance)
                || TopicHealthState.IMPROVING.name().equals(performance)) {
            return new Rung(2, RUNG_2_DAYS, "PERFORMANCE_" + performance);
        }
        if (TopicHealthState.STRONG.name().equals(performance)) {
            return mastered
                    ? new Rung(4, RUNG_4_DAYS, "STRONG_AND_MASTERED")
                    : new Rung(3, RUNG_3_DAYS, "STRONG_NOT_YET_MASTERED");
        }

        // An unrecognised state is left unscheduled rather than defaulted onto a rung — inventing a
        // due date for a verdict this service does not understand is worse than admitting it.
        return null;
    }

    /**
     * The re-test (D7.2): timed practice on this topic. The count comes from the radar's own
     * recommendation where it has one, so the revision plan and the roadmap ask for the same
     * amount of work rather than two different amounts.
     */
    private static RetestPlan retestFor(TopicLearningState t, RadarTopic radar,
                                        WorkloadEstimator.Timing timing) {
        Integer fromRadar = largestQuestionStep(radar);
        String basis = fromRadar == null ? "DEFAULT" : "RECOMMENDED_STEP";
        int wanted = fromRadar == null ? DEFAULT_RETEST_QUESTIONS : fromRadar;

        // Never ask for more questions than the bank actually holds for this topic and exam.
        int count = (int) Math.max(1, Math.min(wanted, t.questionCount()));

        WorkloadEstimate estimate =
                WorkloadEstimator.resolve(t.topicId(), difficultyOf(radar), timing);

        return new RetestPlan(RecommendedAction.TIMED_PRACTICE.name(), count, basis,
                WorkloadEstimator.minutes(count, estimate), estimate);
    }

    private static Integer largestQuestionStep(RadarTopic radar) {
        if (radar == null || radar.recommendedAction() == null
                || radar.recommendedAction().steps() == null) {
            return null;
        }
        Integer largest = null;
        for (ActionStepDto step : radar.recommendedAction().steps()) {
            if (step.questionCount() != null && (largest == null || step.questionCount() > largest)) {
                largest = step.questionCount();
            }
        }
        return largest;
    }

    private static String difficultyOf(RadarTopic radar) {
        if (radar == null || radar.recommendedAction() == null
                || radar.recommendedAction().steps() == null) {
            return null;
        }
        for (ActionStepDto step : radar.recommendedAction().steps()) {
            if (step.difficultyCode() != null) return step.difficultyCode();
        }
        return null;
    }

    /* ==================================================================== ordering and helpers */

    /**
     * Most overdue first, then soonest due, then everything unscheduled — each group tie-broken by
     * the exam's own priority, so the head of the list is what a planner should schedule first.
     */
    private static final Comparator<RevisionTopic> ORDER = Comparator
            .comparingInt((RevisionTopic t) -> switch (t.status()) {
                case "DUE" -> 0;
                case "NOT_DUE" -> 1;
                default -> 2;
            })
            .thenComparing(t -> switch (t.status()) {
                // Within DUE, the longest overdue leads; within NOT_DUE, the soonest.
                case "DUE" -> -(long) (t.daysOverdue() == null ? 0 : t.daysOverdue());
                case "NOT_DUE" -> (long) (t.daysUntilDue() == null ? 0 : t.daysUntilDue());
                default -> 0L;
            })
            .thenComparing(RevisionTopic::examPriority,
                    Comparator.nullsLast(Comparator.reverseOrder()))
            .thenComparing(RevisionTopic::topicName,
                    Comparator.nullsLast(Comparator.naturalOrder()));

    private static Integer daysSince(OffsetDateTime last, OffsetDateTime now) {
        return last == null ? null : (int) Math.max(0, wholeDaysBetween(last, now));
    }

    /** Whole days from {@code from} to {@code to}; negative when {@code to} is in the past. */
    private static long wholeDaysBetween(OffsetDateTime from, OffsetDateTime to) {
        return Duration.between(from, to).toDays();
    }

    /** Which step of the ladder applied, and what selected it. */
    record Rung(int number, int days, String reason) {
    }
}
