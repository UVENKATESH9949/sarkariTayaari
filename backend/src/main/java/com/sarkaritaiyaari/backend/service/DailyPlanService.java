package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.DailyPlanDtos.DailyPlanResponse;
import com.sarkaritaiyaari.backend.dto.DailyPlanDtos.PlannedTask;
import com.sarkaritaiyaari.backend.dto.DailyPlanDtos.TimeBudget;
import com.sarkaritaiyaari.backend.dto.PreparationProfileDtos.PreparationProfile;
import com.sarkaritaiyaari.backend.dto.RevisionPlanDtos.RevisionTopic;
import com.sarkaritaiyaari.backend.dto.StudyRoadmapDtos.RoadmapStep;
import com.sarkaritaiyaari.backend.dto.StudyRoadmapDtos.RoadmapTopic;
import com.sarkaritaiyaari.backend.dto.StudyRoadmapDtos.WorkloadEstimate;
import com.sarkaritaiyaari.backend.dto.WeaknessRadarDtos.RadarTopic;
import com.sarkaritaiyaari.backend.entity.RecommendedAction;
import com.sarkaritaiyaari.backend.entity.StudyTask;
import com.sarkaritaiyaari.backend.entity.TopicHealthState;
import com.sarkaritaiyaari.backend.entity.TopicProgressState;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.repository.MistakeReviewRepository;
import com.sarkaritaiyaari.backend.repository.StudyTaskRepository;
import com.sarkaritaiyaari.backend.repository.SubjectRepository;
import com.sarkaritaiyaari.backend.repository.TopicRepository;
import com.sarkaritaiyaari.backend.service.DailyPlanAllocation.Category;
import com.sarkaritaiyaari.backend.service.LearningStateService.AssembledState;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * What to do today (TASK-3301 Phase 5, extended to five learning purposes by TASK-3501).
 *
 * <p>Phases 4 and 7 rank; this fills a day from their output and <b>writes down what it asked
 * for</b>. It introduces no new ranking of its own, deliberately — a third opinion about what
 * matters is exactly the drift this program has spent three phases removing.
 *
 * <h2>Five purposes, one set of inputs</h2>
 * A day is no longer "revision plus new ground". It is five <i>purposes</i>, every one of them
 * selected from state that already existed before this class did:
 *
 * <table>
 *   <tr><th>{@code source}</th><th>Which topics</th><th>Whose recommendation</th></tr>
 *   <tr><td>{@code REVISION}</td><td>{@link RevisionPlanService}'s due list, most overdue first</td>
 *       <td>its own {@code retest()}</td></tr>
 *   <tr><td>{@code WEAK_TOPIC}</td><td>the radar's order, {@code NEEDS_ATTENTION} then
 *       {@code NEEDS_REVISION}</td><td>{@link WeaknessRadarService}'s action steps</td></tr>
 *   <tr><td>{@code NEW_TOPIC}</td><td>the roadmap's order, filtered to ground not yet covered</td>
 *       <td>{@link StudyRoadmapService}'s steps</td></tr>
 *   <tr><td>{@code STRENGTHEN}</td><td>the radar's order, {@code IMPROVING} then
 *       {@code DEVELOPING}</td><td>the radar's action steps</td></tr>
 *   <tr><td>{@code MISTAKE_REVIEW}</td><td>topics with real recent wrong answers</td>
 *       <td>the count of mistakes themselves</td></tr>
 * </table>
 *
 * Nothing here re-derives health, priority, due dates or how much practice a topic needs. The
 * radar's own 10/15-question recommendations are the ceiling, {@link WorkloadEstimator} is still the
 * only thing that turns a count into minutes, and no model of any kind is consulted.
 *
 * <h2>The budget is an assumption, and says so</h2>
 * Onboarding asks for a <b>band</b> — {@code UNDER_1H}, {@code ONE_TO_TWO}, … — so the student never
 * said "90 minutes". {@link #BUDGETS} maps each band to a figure, and the response reports both the
 * band and the minutes so the assumption is visible rather than buried. {@code SIX_PLUS} takes the
 * <i>floor</i> of an open-ended band: inventing an upper bound the student never gave would be
 * worse than under-planning.
 *
 * <h2>How the day is divided</h2>
 * {@link DailyPlanAllocation} owns the split (25/20/20/15/10 minutes at a 90-minute reference) and
 * the explicit cap on how many new topics a day may open. Two rules follow from it and are worth
 * stating here:
 *
 * <ul>
 *   <li><b>A category may under-spend but never over-spend.</b> Its unspent minutes are available to
 *       whatever is filled after it, which is how a day still fills when one purpose has nothing
 *       eligible — but no purpose can take the whole day.</li>
 *   <li><b>A task that does not fit gets fewer questions, not skipped.</b> The old behaviour skipped
 *       a step whose full recommendation overshot the remaining time; now the count is trimmed to
 *       what fits, and only a topic that cannot fit even one question is passed over.</li>
 * </ul>
 *
 * <p>The half-the-day revision cap that this class used to carry is <b>superseded</b> by that
 * allocation — revision's share is now ~22%, and keeping a second, looser cap beside it would have
 * been two rules for one decision.
 *
 * <h2>One purpose per topic per day</h2>
 * {@code used} is the exclusion set, and it covers the four purposes that assign <b>fresh practice</b>
 * — revision, weak topics, new ground, strengthening. A topic selected for one of them is not
 * selected again, so a weak topic that also happens to be revision-due becomes a revision task
 * (revision is filled first) rather than appearing twice under two headings.
 *
 * <p><b>Mistake review deliberately stands outside that set</b>, and the reason matters. It does not
 * generate a question set at all: it points at specific questions already answered wrongly, to be
 * re-read with their explanations. So it is not a competing purpose for the topic's time — and
 * excluding it would have made the feature almost unreachable in practice, because a topic with
 * recent mistakes is by definition one the student has been practising, which is exactly the kind
 * that weak-topic or strengthening selection claims first. Reviewing six wrong answers in
 * Percentages and then practising Percentages is the natural pairing, not duplication.
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

    /** The five values {@code study_tasks.source} can hold — see V52's own comment. */
    public static final String SOURCE_NEW_TOPIC = "NEW_TOPIC";

    public static final String SOURCE_REVISION = "REVISION";

    public static final String SOURCE_WEAK_TOPIC = "WEAK_TOPIC";

    public static final String SOURCE_STRENGTHEN = "STRENGTHEN";

    public static final String SOURCE_MISTAKE_REVIEW = "MISTAKE_REVIEW";

    /**
     * How far back a wrong answer still counts as worth reviewing. The same 14 days
     * {@link TaskOutcomeService#SETTLE_LOOKBACK_DAYS} uses, deliberately: two different windows for
     * "recent" in one feature would be two different claims wearing the same word.
     *
     * <p>A declared judgement, not a measurement — nobody has checked how long a mistake stays
     * worth revisiting.
     */
    public static final int MISTAKE_LOOKBACK_DAYS = 14;

    /** Radar states that mean "struggling right now" — the Weak Topics purpose. */
    private static final Set<String> WEAK_STATES = Set.of(
            TopicHealthState.NEEDS_ATTENTION.name(),
            TopicHealthState.NEEDS_REVISION.name());

    /**
     * Radar states that mean "encountered, real evidence, not yet strong" — the Practice /
     * Strengthening purpose. {@code STRONG} is deliberately absent: maintaining a topic that is
     * already reliable must not take time a developing one needs.
     */
    private static final Set<String> STRENGTHEN_STATES = Set.of(
            TopicHealthState.IMPROVING.name(),
            TopicHealthState.DEVELOPING.name());

    /** {@code study_tasks.reason} is VARCHAR(400); prose is generated, so clip rather than trust. */
    private static final int MAX_REASON_LENGTH = 400;

    private final LearningStateService learningState;
    private final WorkloadEstimator estimator;
    private final StudyRoadmapService roadmap;
    private final RevisionPlanService revision;
    private final PreparationProfileService profiles;
    private final StudyTaskRepository tasks;
    private final TaskOutcomeService taskOutcomes;
    private final MistakeReviewRepository mistakes;
    private final TopicRepository topics;
    private final SubjectRepository subjects;

    public DailyPlanService(LearningStateService learningState,
                            WorkloadEstimator estimator,
                            StudyRoadmapService roadmap,
                            RevisionPlanService revision,
                            PreparationProfileService profiles,
                            StudyTaskRepository tasks,
                            TaskOutcomeService taskOutcomes,
                            MistakeReviewRepository mistakes,
                            TopicRepository topics,
                            SubjectRepository subjects) {
        this.learningState = learningState;
        this.estimator = estimator;
        this.roadmap = roadmap;
        this.revision = revision;
        this.profiles = profiles;
        this.tasks = tasks;
        this.taskOutcomes = taskOutcomes;
        this.mistakes = mistakes;
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
                assembled.radar().topics(),
                recentMistakes(user.getId(), now),
                timing,
                now);

        return respond(examCode, today, zone, budget, tasks.saveAll(generated), true, settled,
                observedToday);
    }

    /* ============================================================================= generation */

    private List<StudyTask> generate(User user, String examCode, LocalDate today, ZoneId zone,
                                     TimeBudget budget, List<RevisionTopic> revisionTopics,
                                     List<RoadmapTopic> roadmapTopics, List<RadarTopic> radarTopics,
                                     List<MistakeCount> mistakeCounts,
                                     WorkloadEstimator.Timing timing, OffsetDateTime now) {
        /*
         * The roadmap is used as the work catalogue for every topic-based purpose, not just for new
         * ground. It already wraps the radar's own ordered action steps, already resolved the
         * workload estimate for each topic, and already excluded topics the bank cannot serve — so
         * reading it here means Weak Topics and Strengthening ask for exactly the amount of work the
         * radar recommended, rather than a second opinion about the same topic.
         */
        Map<UUID, RoadmapTopic> workByTopic = new HashMap<>();
        for (RoadmapTopic t : roadmapTopics) workByTopic.put(t.topicId(), t);

        Map<UUID, RadarTopic> radarByTopic = new HashMap<>();
        for (RadarTopic t : radarTopics) radarByTopic.put(t.topicId(), t);

        Packer packer = new Packer(user, examCode, today, zone, now, budget.minutes());

        // The order matters: it is the priority order, and it is what the exclusion set resolves
        // ties with. Revision leads, mistake review trails.
        packer.packRevision(revisionTopics);
        packer.packFromRadar(radarTopics, workByTopic, Category.WEAK_TOPIC, SOURCE_WEAK_TOPIC,
                WEAK_STATES);
        packer.packNewTopics(roadmapTopics);
        packer.packFromRadar(radarTopics, workByTopic, Category.STRENGTHEN, SOURCE_STRENGTHEN,
                STRENGTHEN_STATES);
        packer.packMistakeReview(mistakeCounts, radarByTopic, timing);

        /*
         * A plan with nothing in it is useless, and a single task longer than the whole budget is a
         * real situation — a student with 45 minutes and a topic whose smallest step is estimated at
         * 50. Assign the smallest available piece of work rather than returning an empty day, and
         * let the reported plannedMinutes exceed the budget honestly instead of hiding the
         * overshoot.
         */
        if (packer.tasks.isEmpty()) {
            StudyTask fallback = smallestAvailable(user, examCode, today, zone, revisionTopics,
                    roadmapTopics, now);
            if (fallback != null) packer.tasks.add(fallback);
        }

        return packer.tasks;
    }

    /**
     * One day's packing state: what has been assigned, what each purpose may still spend, and which
     * topics are already taken.
     *
     * <p>An inner class rather than a pile of mutable locals threaded through six methods — the
     * remaining budget, the per-category allowances and the exclusion set all change together on
     * every assignment, and keeping them in one place is what makes that legible.
     */
    private final class Packer {

        private final User user;
        private final String examCode;
        private final LocalDate today;
        private final ZoneId zone;
        private final OffsetDateTime now;

        private final List<StudyTask> tasks = new ArrayList<>();
        /**
         * Topics already given a fresh-practice purpose today. Mistake review neither reads nor
         * writes this — see the class doc for why it is not a competing purpose.
         */
        private final Set<UUID> used = new HashSet<>();
        private final Map<Category, Integer> allowance;
        private final int maxNewTopics;

        private int remainingTotal;
        private int newTopicsAssigned;

        private Packer(User user, String examCode, LocalDate today, ZoneId zone, OffsetDateTime now,
                       int budgetMinutes) {
            this.user = user;
            this.examCode = examCode;
            this.today = today;
            this.zone = zone;
            this.now = now;
            this.allowance = DailyPlanAllocation.allocate(budgetMinutes);
            this.maxNewTopics = DailyPlanAllocation.maxNewTopics(budgetMinutes);
            this.remainingTotal = budgetMinutes;
        }

        /**
         * Minutes this purpose may still spend — its own remaining share, bounded by what the whole
         * day has left. The second bound is what stops an earlier purpose's under-spend being
         * double-counted by two later ones.
         */
        private int allowanceFor(Category category) {
            return Math.min(allowance.getOrDefault(category, 0), remainingTotal);
        }

        private void add(Category category, String source, String action, UUID topicId,
                         String topicName, UUID subjectId, String subjectName, String difficultyCode,
                         int questionCount, WorkloadEstimate estimate, String reason) {
            int minutes = WorkloadEstimator.minutes(questionCount, estimate);
            tasks.add(task(user, examCode, today, zone, tasks.size(), source, action, topicId,
                    topicName, subjectId, subjectName, difficultyCode, minutes, questionCount,
                    estimate.source(), reason, now));
            allowance.merge(category, -minutes, Integer::sum);
            remainingTotal -= minutes;
            // Mistake review claims no topic: it reviews questions already answered, so it neither
            // competes for the topic's practice time nor blocks a later purpose from using it.
            if (topicId != null && category != Category.MISTAKE_REVIEW) used.add(topicId);
        }

        /** Revision that is actually due, in Phase 7's order — most overdue first. */
        private void packRevision(List<RevisionTopic> revisionTopics) {
            for (RevisionTopic t : revisionTopics) {
                if (allowanceFor(Category.REVISION) <= 0) return;
                if (!"DUE".equals(t.status()) || t.retest() == null) continue;
                if (t.topicId() != null && used.contains(t.topicId())) continue;

                int fit = DailyPlanAllocation.questionsThatFit(t.retest().questionCount(),
                        allowanceFor(Category.REVISION),
                        t.retest().estimate().secondsPerQuestion());
                // Not a break: a later topic with a faster measured pace may still fit where this
                // one did not.
                if (fit <= 0) continue;

                add(Category.REVISION, SOURCE_REVISION, t.retest().action(), t.topicId(),
                        t.topicName(), t.subjectId(), t.subjectName(), null, fit,
                        t.retest().estimate(), revisionReason(t));
            }
        }

        /**
         * Weak Topics and Strengthening: the same walk over the radar's own ordering, differing only
         * in which states qualify.
         *
         * <p>The radar already sorts its topics by section ({@code NEEDS_ATTENTION} before
         * {@code NEEDS_REVISION}, {@code IMPROVING} before {@code DEVELOPING}) and, within a
         * section, by how much fixing the topic is worth. Walking it in order therefore needs no
         * ranking of its own — which is the whole point.
         */
        private void packFromRadar(List<RadarTopic> radarTopics,
                                   Map<UUID, RoadmapTopic> workByTopic,
                                   Category category, String source, Set<String> states) {
            for (RadarTopic radar : radarTopics) {
                if (allowanceFor(category) <= 0) return;
                if (!states.contains(radar.state())) continue;
                if (used.contains(radar.topicId())) continue;

                RoadmapTopic work = workByTopic.get(radar.topicId());
                // Absent means the roadmap excluded it — no practicable questions for this exam.
                if (work == null) continue;
                RoadmapStep step = firstEstimableStep(work);
                if (step == null || step.questionCount() == null) continue;

                int fit = DailyPlanAllocation.questionsThatFit(step.questionCount(),
                        allowanceFor(category), work.estimate().secondsPerQuestion());
                if (fit <= 0) continue;

                add(category, source, step.action(), radar.topicId(), radar.topicName(),
                        radar.subjectId(), radar.subjectName(), step.difficultyCode(), fit,
                        work.estimate(), radarReason(radar));
            }
        }

        /**
         * New ground, in the roadmap's order — priority-ranked and already balanced across subjects.
         *
         * <p>Prerequisites-met topics are offered first and blocked ones only if nothing else is
         * eligible. The DAG is a sequencing rule, and opening a topic whose foundation is shaky
         * mostly produces frustration — but refusing outright would leave a student whose whole
         * syllabus is gated with no new work at all.
         */
        private void packNewTopics(List<RoadmapTopic> roadmapTopics) {
            packNewTopicPass(roadmapTopics, true);
            packNewTopicPass(roadmapTopics, false);
        }

        private void packNewTopicPass(List<RoadmapTopic> roadmapTopics, boolean prerequisitesMet) {
            for (RoadmapTopic t : roadmapTopics) {
                // The explicit maximum, and the reason this category is not just "budget divided by
                // question duration" any more.
                if (newTopicsAssigned >= maxNewTopics) return;
                if (allowanceFor(Category.NEW_TOPIC) <= 0) return;
                if (t.prerequisitesMet() != prerequisitesMet) continue;
                if (!isNewGround(t)) continue;
                if (used.contains(t.topicId())) continue;

                /*
                 * One step per topic, not the whole ladder. A topic's recommendation is a sequence
                 * spanning days ("10 foundational, then 15 medium, then 10 PYQ"); putting all of it
                 * into one day would both blow the budget and misrepresent what the radar meant.
                 */
                RoadmapStep step = firstEstimableStep(t);
                if (step == null || step.questionCount() == null) continue;

                int fit = DailyPlanAllocation.questionsThatFit(step.questionCount(),
                        allowanceFor(Category.NEW_TOPIC), t.estimate().secondsPerQuestion());
                if (fit <= 0) continue;

                add(Category.NEW_TOPIC, SOURCE_NEW_TOPIC, step.action(), t.topicId(), t.topicName(),
                        t.subjectId(), t.subjectName(), step.difficultyCode(), fit, t.estimate(),
                        practiceReason(t));
                newTopicsAssigned++;
            }
        }

        /**
         * Mistakes the student actually made, most recent first.
         *
         * <p>Scoped by the radar's topic list rather than by the session's own {@code exam_code}:
         * that column is nullable and is null for an "all exams" practice session, so a topic-map
         * filter is both stricter and the same scoping every other part of this program uses.
         *
         * <p>Sized with {@link WorkloadEstimator} like everything else. Stated plainly: re-reading a
         * question and its explanation is probably not the same work as solving a fresh one, but
         * inventing a separate per-mistake duration would be a fabricated constant, and this app has
         * no measurement of review time to use instead.
         */
        private void packMistakeReview(List<MistakeCount> mistakeCounts,
                                       Map<UUID, RadarTopic> radarByTopic,
                                       WorkloadEstimator.Timing timing) {
            for (MistakeCount mistake : mistakeCounts) {
                if (allowanceFor(Category.MISTAKE_REVIEW) <= 0) return;
                // Deliberately NOT filtered against `used`, and deliberately not added to it.
                RadarTopic radar = radarByTopic.get(mistake.topicId());
                // A mistake on a topic outside this exam's syllabus is real, but it is not this
                // exam's preparation.
                if (radar == null) continue;

                WorkloadEstimate estimate =
                        WorkloadEstimator.resolve(mistake.topicId(), null, timing);
                int wanted = (int) Math.min(Integer.MAX_VALUE, mistake.wrongCount());
                int fit = DailyPlanAllocation.questionsThatFit(wanted,
                        allowanceFor(Category.MISTAKE_REVIEW), estimate.secondsPerQuestion());
                if (fit <= 0) continue;

                add(Category.MISTAKE_REVIEW, SOURCE_MISTAKE_REVIEW, RecommendedAction.REVISION.name(),
                        mistake.topicId(), radar.topicName(), radar.subjectId(), radar.subjectName(),
                        null, fit, estimate, mistakeReason(radar.topicName(), mistake.wrongCount()));
            }
        }
    }

    /**
     * Ground not yet covered, by the two dimensions that can say so: the curriculum ladder has not
     * started it, or the health model has never been able to judge it. Everything else has been
     * encountered, and belongs to Strengthening or Weak Topics instead.
     */
    private static boolean isNewGround(RoadmapTopic t) {
        if (TopicProgressState.NOT_STARTED.name().equals(t.curriculumState())) return true;
        String performance = t.performanceState();
        return performance == null
                || TopicHealthState.INSUFFICIENT_DATA.name().equals(performance);
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
            return task(user, examCode, today, zone, 0, SOURCE_REVISION,
                    bestRevision.retest().action(), bestRevision.topicId(), bestRevision.topicName(),
                    bestRevision.subjectId(), bestRevision.subjectName(), null,
                    bestRevision.retest().estimatedMinutes(), bestRevision.retest().questionCount(),
                    bestRevision.retest().estimate().source(), revisionReason(bestRevision), now);
        }
        if (bestStep != null) {
            return task(user, examCode, today, zone, 0, SOURCE_NEW_TOPIC,
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
        task.setReason(clip(reason));
        task.setCreatedAt(now);
        return task;
    }

    /* =============================================================================== mistakes */

    /** One topic's recent wrong answers: how many, and when the most recent one was. */
    record MistakeCount(UUID topicId, long wrongCount, OffsetDateTime mostRecentAt) {
    }

    /**
     * Recent mistakes per topic, practice and mock pooled, most recent first then most numerous.
     *
     * <p>"Recent and meaningful", in the only two terms the data actually carries — nothing here
     * weighs how *important* a mistake was, because nothing in the schema knows.
     */
    private List<MistakeCount> recentMistakes(UUID userId, OffsetDateTime now) {
        OffsetDateTime since = now.minusDays(MISTAKE_LOOKBACK_DAYS);

        Map<UUID, long[]> counts = new HashMap<>();
        Map<UUID, OffsetDateTime> latest = new HashMap<>();
        accumulateMistakes(counts, latest, mistakes.practiceMistakesByTopic(userId, since));
        accumulateMistakes(counts, latest, mistakes.mockMistakesByTopic(userId, since));

        List<MistakeCount> out = new ArrayList<>();
        for (Map.Entry<UUID, long[]> entry : counts.entrySet()) {
            out.add(new MistakeCount(entry.getKey(), entry.getValue()[0], latest.get(entry.getKey())));
        }
        out.sort(Comparator
                .comparing(MistakeCount::mostRecentAt,
                        Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(Comparator.comparingLong(MistakeCount::wrongCount).reversed()));
        return out;
    }

    private static void accumulateMistakes(Map<UUID, long[]> counts,
                                           Map<UUID, OffsetDateTime> latest,
                                           List<Object[]> rows) {
        for (Object[] row : rows) {
            UUID topicId = (UUID) row[0];
            if (topicId == null || row[1] == null) continue;
            counts.computeIfAbsent(topicId, id -> new long[1])[0] += ((Number) row[1]).longValue();
            OffsetDateTime at = asOffsetDateTime(row[2]);
            if (at == null) continue;
            OffsetDateTime known = latest.get(topicId);
            if (known == null || at.isAfter(known)) latest.put(topicId, at);
        }
    }

    /**
     * An aggregate's temporal type is the JDBC driver's choice, not the entity's: a plain cast to
     * {@code OffsetDateTime} on the result of a JPQL {@code max()} is the kind of thing that works
     * on one driver and throws {@code ClassCastException} on the next. Only the ordering of mistake
     * topics depends on it, so an unrecognised type degrades to "date unknown" rather than taking
     * the whole endpoint down.
     */
    private static OffsetDateTime asOffsetDateTime(Object value) {
        if (value instanceof OffsetDateTime at) return at;
        if (value instanceof java.time.Instant instant) {
            return instant.atOffset(java.time.ZoneOffset.UTC);
        }
        if (value instanceof java.sql.Timestamp timestamp) {
            return timestamp.toInstant().atOffset(java.time.ZoneOffset.UTC);
        }
        if (value instanceof java.time.LocalDateTime local) {
            return local.atOffset(java.time.ZoneOffset.UTC);
        }
        return null;
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

    /**
     * Weak Topics and Strengthening reuse the radar's own one-sentence explanation rather than
     * writing a second one. It is already built from the same reason codes that chose the topic,
     * already deterministic, and already written in the tone the radar's own spec settled on — a
     * new sentence here would be a second description of one diagnosis, free to disagree with it.
     */
    private static String radarReason(RadarTopic radar) {
        String explanation = radar.explanation();
        if (explanation != null && !explanation.isBlank()) return explanation;
        String topic = radar.topicName() == null ? "This topic" : radar.topicName();
        return topic + " is worth time today based on your recent work.";
    }

    private static String mistakeReason(String topicName, long wrongCount) {
        String topic = topicName == null ? "This topic" : topicName;
        return "You got " + wrongCount + (wrongCount == 1 ? " question" : " questions")
                + " wrong in " + topic + " in the last " + MISTAKE_LOOKBACK_DAYS
                + " days — worth a look before more practice.";
    }

    private static String clip(String reason) {
        if (reason == null || reason.length() <= MAX_REASON_LENGTH) return reason;
        return reason.substring(0, MAX_REASON_LENGTH - 1) + "…";
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
