package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.DailyPlanDtos.DailyPlanResponse;
import com.sarkaritaiyaari.backend.dto.DailyPlanDtos.PlannedTask;
import com.sarkaritaiyaari.backend.dto.DailyPlanDtos.TimeBudget;
import com.sarkaritaiyaari.backend.dto.PreparationProfileDtos.PreparationProfile;
import com.sarkaritaiyaari.backend.dto.RevisionPlanDtos.RevisionTopic;
import com.sarkaritaiyaari.backend.dto.StudyRoadmapDtos.RoadmapStep;
import com.sarkaritaiyaari.backend.dto.StudyRoadmapDtos.RoadmapTopic;
import com.sarkaritaiyaari.backend.entity.StudyTask;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.repository.StudyTaskRepository;
import com.sarkaritaiyaari.backend.repository.SubjectRepository;
import com.sarkaritaiyaari.backend.repository.TopicRepository;
import com.sarkaritaiyaari.backend.service.LearningStateService.AssembledState;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * What to do today (TASK-3301, Phase 5).
 *
 * <p>Phases 4 and 7 rank; this fills a day from their output and <b>writes down what it asked
 * for</b>. It introduces no new ranking of its own, deliberately — a third opinion about what
 * matters is exactly the drift this program has spent three phases removing.
 *
 * <h2>The budget is an assumption, and says so</h2>
 * Onboarding asks for a <b>band</b> — {@code UNDER_1H}, {@code ONE_TO_TWO}, … — so the student never
 * said "90 minutes". {@link #BUDGETS} maps each band to a figure, and the response reports both the
 * band and the minutes so the assumption is visible rather than buried. {@code SIX_PLUS} takes the
 * <i>floor</i> of an open-ended band: inventing an upper bound the student never gave would be
 * worse than under-planning.
 *
 * <h2>Revision first, capped</h2>
 * Overdue revision leads (D5.4): a topic already learned and now fading is cheaper to recover than
 * a new one is to build, and Phase 7 has already ranked urgency. But revision never takes the whole
 * day — {@link #REVISION_SHARE} caps it, so a student with a long backlog still makes forward
 * progress. That cap is a judgement, named here rather than buried, and is the kind of thing
 * Phase 6 may later tune from real behaviour.
 *
 * <h2>A day is planned once</h2>
 * The first read for a given (student, day, exam) generates and persists; every later read returns
 * the same rows. Re-planning on each read would mean a student who opened the app after finishing
 * two tasks saw a different list — and would destroy the record Phase 6 needs of what was
 * originally asked for.
 */
@Service
@Transactional
public class DailyPlanService {

    /**
     * Minutes per band. Mid-points, except {@code SIX_PLUS}, which takes the floor of an
     * open-ended band. These are assumptions, reported as {@code STATED_BAND} because they are at
     * least derived from the student's own answer.
     */
    static final Map<String, Integer> BUDGETS = Map.of(
            "UNDER_1H", 45,
            "ONE_TO_TWO", 90,
            "TWO_TO_FOUR", 180,
            "FOUR_TO_SIX", 300,
            "SIX_PLUS", 360);

    /**
     * For an account that never onboarded or skipped the step. Labelled {@code DEFAULT}, since
     * nothing about it came from the student.
     */
    public static final int DEFAULT_BUDGET_MINUTES = 60;

    /** The most of a day revision may take, leaving the rest for new ground. */
    static final double REVISION_SHARE = 0.5;

    private final LearningStateService learningState;
    private final WorkloadEstimator estimator;
    private final StudyRoadmapService roadmap;
    private final RevisionPlanService revision;
    private final PreparationProfileService profiles;
    private final StudyTaskRepository tasks;
    private final TaskOutcomeService taskOutcomes;
    private final TopicRepository topics;
    private final SubjectRepository subjects;

    public DailyPlanService(LearningStateService learningState,
                            WorkloadEstimator estimator,
                            StudyRoadmapService roadmap,
                            RevisionPlanService revision,
                            PreparationProfileService profiles,
                            StudyTaskRepository tasks,
                            TaskOutcomeService taskOutcomes,
                            TopicRepository topics,
                            SubjectRepository subjects) {
        this.learningState = learningState;
        this.estimator = estimator;
        this.roadmap = roadmap;
        this.revision = revision;
        this.profiles = profiles;
        this.tasks = tasks;
        this.taskOutcomes = taskOutcomes;
        this.topics = topics;
        this.subjects = subjects;
    }

    public DailyPlanResponse planFor(User user, String examCode, String zoneId, OffsetDateTime now) {
        ZoneId zone = parseZone(zoneId);
        LocalDate today = now.atZoneSameInstant(zone).toLocalDate();

        /*
         * Settle days that have already closed before doing anything else (TASK-3401). This is the
         * natural moment: it is the one time the system is guaranteed to be looking at this student
         * again, and yesterday's outcome is exactly what makes today's plan defensible. Idempotent,
         * because only ASSIGNED rows are eligible.
         */
        int settled = taskOutcomes.settlePastDays(user.getId(), today);

        Map<UUID, TaskOutcomeService.Observed> observedToday =
                taskOutcomes.observedOn(user.getId(), today, zone);

        List<StudyTask> existing = tasks.findForDay(user.getId(), today, examCode);
        if (!existing.isEmpty()) {
            return respond(examCode, today, zone, budgetFor(user), existing, false, settled,
                    observedToday);
        }

        /*
         * One assembly for both halves of the plan. Calling roadmapFor and planFor separately would
         * assemble the learning state twice — and it rebuilds health rows lazily, so that is two
         * rounds of DELETE-and-rewrite rather than two reads.
         */
        AssembledState assembled = learningState.assemble(user, examCode, now);
        WorkloadEstimator.Timing timing = estimator.load(user.getId(), now);

        TimeBudget budget = budgetFor(user);
        List<StudyTask> generated = generate(user, examCode, today, zone, budget,
                revision.planFrom(assembled, timing, now).topics(),
                roadmap.roadmapFrom(assembled, timing, now).topics(),
                now);

        return respond(examCode, today, zone, budget, tasks.saveAll(generated), true, settled,
                observedToday);
    }

    /* ============================================================================= generation */

    private List<StudyTask> generate(User user, String examCode, LocalDate today, ZoneId zone,
                                     TimeBudget budget, List<RevisionTopic> revisionTopics,
                                     List<RoadmapTopic> roadmapTopics, OffsetDateTime now) {
        List<StudyTask> out = new ArrayList<>();
        int remaining = budget.minutes();
        int revisionAllowance = (int) Math.round(budget.minutes() * REVISION_SHARE);

        // 1. Revision that is actually due, in Phase 7's order — most overdue first.
        for (RevisionTopic t : revisionTopics) {
            if (!"DUE".equals(t.status()) || t.retest() == null) continue;
            int minutes = t.retest().estimatedMinutes();
            if (minutes > revisionAllowance || minutes > remaining) continue;

            out.add(task(user, examCode, today, zone, out.size(), "REVISION",
                    t.retest().action(), t.topicId(), t.topicName(), t.subjectId(), t.subjectName(),
                    null, minutes, t.retest().questionCount(),
                    t.retest().estimate().source(), revisionReason(t), now));
            remaining -= minutes;
            revisionAllowance -= minutes;
        }

        // 2. New ground, in Phase 4's order — priority, already balanced across subjects.
        for (RoadmapTopic t : roadmapTopics) {
            if (remaining <= 0) break;

            /*
             * One step per topic, not the whole ladder. A topic's recommendation is a sequence
             * spanning days ("10 foundational, then 15 medium, then 10 PYQ"); putting all of it into
             * one day would both blow the budget and misrepresent what the radar meant.
             */
            RoadmapStep step = firstEstimableStep(t);
            if (step == null) continue;
            if (step.estimatedMinutes() > remaining) continue;

            out.add(task(user, examCode, today, zone, out.size(), "PRACTICE",
                    step.action(), t.topicId(), t.topicName(), t.subjectId(), t.subjectName(),
                    step.difficultyCode(), step.estimatedMinutes(), step.questionCount(),
                    t.estimate().source(), practiceReason(t), now));
            remaining -= step.estimatedMinutes();
        }

        /*
         * A plan with nothing in it is useless, and a single task longer than the whole budget is a
         * real situation — a student with 45 minutes and a topic whose first step is estimated at
         * 50. Assign the smallest available piece of work rather than returning an empty day, and
         * let the reported plannedMinutes exceed the budget honestly instead of hiding the
         * overshoot.
         */
        if (out.isEmpty()) {
            StudyTask fallback = smallestAvailable(user, examCode, today, zone, revisionTopics,
                    roadmapTopics, now);
            if (fallback != null) out.add(fallback);
        }

        return out;
    }

    private StudyTask smallestAvailable(User user, String examCode, LocalDate today, ZoneId zone,
                                        List<RevisionTopic> revisionTopics,
                                        List<RoadmapTopic> roadmapTopics, OffsetDateTime now) {
        RevisionTopic bestRevision = null;
        for (RevisionTopic t : revisionTopics) {
            if (!"DUE".equals(t.status()) || t.retest() == null) continue;
            if (bestRevision == null
                    || t.retest().estimatedMinutes() < bestRevision.retest().estimatedMinutes()) {
                bestRevision = t;
            }
        }

        RoadmapTopic bestTopic = null;
        RoadmapStep bestStep = null;
        for (RoadmapTopic t : roadmapTopics) {
            RoadmapStep step = firstEstimableStep(t);
            if (step == null) continue;
            if (bestStep == null || step.estimatedMinutes() < bestStep.estimatedMinutes()) {
                bestTopic = t;
                bestStep = step;
            }
        }

        boolean revisionWins = bestRevision != null
                && (bestStep == null
                    || bestRevision.retest().estimatedMinutes() <= bestStep.estimatedMinutes());

        if (revisionWins) {
            return task(user, examCode, today, zone, 0, "REVISION",
                    bestRevision.retest().action(), bestRevision.topicId(), bestRevision.topicName(),
                    bestRevision.subjectId(), bestRevision.subjectName(), null,
                    bestRevision.retest().estimatedMinutes(), bestRevision.retest().questionCount(),
                    bestRevision.retest().estimate().source(), revisionReason(bestRevision), now);
        }
        if (bestStep != null) {
            return task(user, examCode, today, zone, 0, "PRACTICE",
                    bestStep.action(), bestTopic.topicId(), bestTopic.topicName(),
                    bestTopic.subjectId(), bestTopic.subjectName(), bestStep.difficultyCode(),
                    bestStep.estimatedMinutes(), bestStep.questionCount(),
                    bestTopic.estimate().source(), practiceReason(bestTopic), now);
        }
        // Nothing practicable at all for this exam — an empty plan is then the honest answer.
        return null;
    }

    /**
     * The first step that carries a question count. Steps without one
     * ({@code LEARN_CONCEPT}, {@code REVISION}, {@code TIMED_PRACTICE} inside the roadmap) have no
     * duration by Phase 4's own rule, so they cannot be budgeted into a day — scheduling something
     * of unknown length is how a plan stops meaning anything.
     */
    private static RoadmapStep firstEstimableStep(RoadmapTopic topic) {
        if (topic.steps() == null) return null;
        for (RoadmapStep step : topic.steps()) {
            if (step.estimatedMinutes() != null && step.questionCount() != null) return step;
        }
        return null;
    }

    private StudyTask task(User user, String examCode, LocalDate today, ZoneId zone, int order,
                           String source, String action, UUID topicId, String topicName,
                           UUID subjectId, String subjectName, String difficultyCode,
                           int minutes, Integer questionCount, String estimateSource,
                           String reason, OffsetDateTime now) {
        StudyTask task = new StudyTask();
        task.setId(UUID.randomUUID());
        task.setUserId(user.getId());
        task.setPlanDate(today);
        task.setPlanZone(zone.getId());
        task.setExamCode(examCode);
        task.setSource(source);
        task.setAction(action);
        // Resolved by reference so the FK holds, with the names denormalised beside them so the
        // record stays readable if a topic later leaves the catalogue.
        if (topicId != null) topics.findById(topicId).ifPresent(task::setTopic);
        if (subjectId != null) subjects.findById(subjectId).ifPresent(task::setSubject);
        task.setTopicName(topicName);
        task.setSubjectName(subjectName);
        task.setDifficultyCode(difficultyCode);
        task.setPlannedMinutes(minutes);
        task.setPlannedQuestionCount(questionCount);
        task.setEstimateSource(estimateSource);
        task.setDisplayOrder(order);
        task.setStatus("ASSIGNED");
        task.setReason(reason);
        task.setCreatedAt(now);
        return task;
    }

    /* =============================================================================== reasons */

    /*
     * One deterministic sentence per task (TASK-3401 D6.3). A plan that changes with no reason
     * given reads as arbitrary, and this project already explains rather than asserts — RadarTopic
     * carries the same kind of sentence for the same reason.
     *
     * These are built from a rule table, never from a model, and they are STORED on the task: a
     * reason explains why something was chosen at the moment it was chosen, and re-deriving it a
     * week later would explain an old plan using new state — which is precisely the thing that
     * moved.
     */

    private static String revisionReason(RevisionTopic t) {
        String topic = t.topicName() == null ? "This topic" : t.topicName();
        Integer overdue = t.daysOverdue();
        Integer since = t.daysSinceLastPractice();

        if (overdue != null && overdue > 0) {
            return topic + " is " + overdue + (overdue == 1 ? " day" : " days")
                    + " past its revision date — last practised "
                    + (since == null ? "a while ago" : since + " days ago")
                    + ", on a " + t.intervalDays() + "-day interval.";
        }
        return topic + " is due for revision today, on a " + t.intervalDays() + "-day interval.";
    }

    private static String practiceReason(RoadmapTopic t) {
        String topic = t.topicName() == null ? "This topic" : t.topicName();

        // Weakest signal first: a topic in trouble is here because of that, whatever its rank.
        if ("NEEDS_ATTENTION".equals(t.performanceState())
                || "NEEDS_REVISION".equals(t.performanceState())) {
            return topic + " needs attention — your recent work there has been struggling, and it "
                    + "ranks " + t.priorityRank() + " for this exam.";
        }
        if ("NOT_STARTED".equals(t.curriculumState())) {
            return topic + " is next by exam priority (rank " + t.priorityRank()
                    + ") and you have not started it yet.";
        }
        if ("IMPROVING".equals(t.performanceState())) {
            return topic + " is improving — keeping it going while it ranks " + t.priorityRank()
                    + " for this exam.";
        }
        return topic + " ranks " + t.priorityRank() + " for this exam and is not finished yet.";
    }

    /* ================================================================================ budget */

    private TimeBudget budgetFor(User user) {
        String band = profiles.find(user)
                .map(PreparationProfile::dailyStudyTime)
                .orElse(null);

        Integer minutes = band == null ? null : BUDGETS.get(band);
        if (minutes == null) {
            // Either no profile, a skipped step, or a band this server does not recognise. All
            // three are "the student has not told us", and all three get the declared default.
            return new TimeBudget(band, DEFAULT_BUDGET_MINUTES, "DEFAULT");
        }
        return new TimeBudget(band, minutes, "STATED_BAND");
    }

    /* ================================================================================= shared */

    private static ZoneId parseZone(String zoneId) {
        if (zoneId == null || zoneId.isBlank()) return ZoneId.of("UTC");
        try {
            return ZoneId.of(zoneId);
        } catch (java.time.DateTimeException e) {
            // Same rule /api/me/analytics already applies: an unknown zone is a 400, never a silent
            // fallback that would quietly plan somebody else's day.
            throw new IllegalArgumentException("Unknown time zone: " + zoneId);
        }
    }

    private static DailyPlanResponse respond(String examCode, LocalDate today, ZoneId zone,
                                             TimeBudget budget, Iterable<StudyTask> rows,
                                             boolean generated, int settled,
                                             Map<UUID, TaskOutcomeService.Observed> observed) {
        List<PlannedTask> out = new ArrayList<>();
        int planned = 0;
        for (StudyTask row : rows) {
            planned += row.getPlannedMinutes();
            TaskOutcomeService.Observed seen = row.getTopicId() == null
                    ? TaskOutcomeService.Observed.NOTHING
                    : observed.getOrDefault(row.getTopicId(), TaskOutcomeService.Observed.NOTHING);
            out.add(new PlannedTask(
                    row.getId(),
                    row.getDisplayOrder(),
                    row.getSource(),
                    row.getAction(),
                    row.getTopic() == null ? null : row.getTopic().getId(),
                    row.getTopicName(),
                    row.getSubject() == null ? null : row.getSubject().getId(),
                    row.getSubjectName(),
                    row.getDifficultyCode(),
                    row.getPlannedMinutes(),
                    row.getPlannedQuestionCount(),
                    row.getEstimateSource(),
                    row.getStatus(),
                    row.getReason(),
                    seen.answered(),
                    seen.accuracyPercent(),
                    row.getCreatedAt()));
        }
        return new DailyPlanResponse(examCode, today, zone.getId(), budget, planned, generated,
                settled, out);
    }
}
