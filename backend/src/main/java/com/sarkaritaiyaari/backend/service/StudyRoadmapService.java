package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.LearningStateDtos.TopicLearningState;
import com.sarkaritaiyaari.backend.dto.StudyRoadmapDtos.RoadmapStep;
import com.sarkaritaiyaari.backend.dto.StudyRoadmapDtos.RoadmapSubject;
import com.sarkaritaiyaari.backend.dto.StudyRoadmapDtos.RoadmapTimeline;
import com.sarkaritaiyaari.backend.dto.StudyRoadmapDtos.RoadmapTopic;
import com.sarkaritaiyaari.backend.dto.StudyRoadmapDtos.StudyRoadmapResponse;
import com.sarkaritaiyaari.backend.dto.StudyRoadmapDtos.WorkloadEstimate;
import com.sarkaritaiyaari.backend.dto.WeaknessRadarDtos.ActionStepDto;
import com.sarkaritaiyaari.backend.dto.WeaknessRadarDtos.PrerequisiteRef;
import com.sarkaritaiyaari.backend.dto.WeaknessRadarDtos.RadarTopic;
import com.sarkaritaiyaari.backend.entity.ContentStatus;
import com.sarkaritaiyaari.backend.entity.RecruitmentCycle;
import com.sarkaritaiyaari.backend.entity.TopicProgressState;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.repository.RecruitmentCycleRepository;
import com.sarkaritaiyaari.backend.service.LearningStateService.AssembledState;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * The personalized study roadmap: what to study, in what order, and <b>how much work it is</b>.
 * TASK-3101, Phase 4 of the personalization program.
 *
 * <h2>What this adds, and what it reuses</h2>
 * The ordering input (Epic L's {@code final_priority}), the sequencing input (the
 * {@code topic_prerequisites} DAG), the state (Phase 3's composite) and the <i>plan</i> itself
 * (the radar's ordered {@link ActionStepDto}s, which already say "10 foundational questions at the
 * easiest difficulty, then 15 medium, then 10 PYQ") all already existed. This service adds exactly
 * three things:
 *
 * <ol>
 *   <li><b>Minutes.</b> A step's question count times a seconds-per-question estimate whose
 *       provenance is always declared — see {@link WorkloadEstimator}.</li>
 *   <li><b>Subject balance.</b> Priority order alone will happily open a plan with five consecutive
 *       Quantitative Aptitude topics; {@link #interleaveBySubject} caps the run and keeps each
 *       topic's original rank in the payload so the reordering is visible.</li>
 *   <li><b>The exam's clock</b>, when the exam has one. Ten of eleven exams have no published
 *       recruitment cycle, so an undated roadmap is the normal case, not a failure.</li>
 * </ol>
 *
 * <h2>What it deliberately does not do</h2>
 * It does not re-derive how much practice a topic needs — that would be a second ladder that could
 * disagree with the radar about the same student, which is the exact class of drift Phase 3 existed
 * to remove. It stores nothing (D4.1). And it produces no readiness figure: total minutes against
 * days remaining is arithmetic over an estimate and is reported as arithmetic, never folded into a
 * single per-exam percentage.
 *
 * <p><b>This can write, for the same reason {@link LearningStateService} can</b> — the health model
 * recomputes lazily underneath, so this is transactional and not {@code readOnly}.
 */
@Service
@Transactional
public class StudyRoadmapService {

    /**
     * How many topics from one subject may sit next to each other in the plan. Priority ordering is
     * per topic and knows nothing about balance, so without this a student whose weakest topics all
     * live in one subject gets a roadmap that is that subject for weeks.
     */
    public static final int MAX_CONSECUTIVE_PER_SUBJECT = 2;

    private final LearningStateService learningState;
    private final WorkloadEstimator estimator;
    private final RecruitmentCycleRepository cycles;

    public StudyRoadmapService(LearningStateService learningState,
                               WorkloadEstimator estimator,
                               RecruitmentCycleRepository cycles) {
        this.learningState = learningState;
        this.estimator = estimator;
        this.cycles = cycles;
    }

    public StudyRoadmapResponse roadmapFor(User user, String examCode, OffsetDateTime now) {
        return roadmapFrom(learningState.assemble(user, examCode, now),
                estimator.load(user.getId(), now), now);
    }

    /**
     * The same roadmap, built from state and timings a caller already has.
     *
     * <p>Exists for {@link DailyPlanService}, which needs the roadmap and the revision plan in one
     * request. Letting it call {@link #roadmapFor} and {@code RevisionPlanService.planFor} would
     * assemble the learning state twice per day-plan — and since that lazily rebuilds health rows,
     * twice would mean two rounds of DELETE-and-rewrite, not two reads. Same reasoning that put
     * {@code assemble} on {@link LearningStateService} in the first place.
     */
    public StudyRoadmapResponse roadmapFrom(AssembledState assembled,
                                            WorkloadEstimator.Timing timing,
                                            OffsetDateTime now) {
        Map<UUID, RadarTopic> radarByTopic = new HashMap<>();
        for (RadarTopic t : assembled.radar().topics()) {
            radarByTopic.put(t.topicId(), t);
        }

        String examCode = assembled.state().examCode();

        /*
         * A topic with no practicable questions is excluded outright rather than listed with
         * nothing behind it — the same rule PreparePlanService already applies, and for the same
         * reason: it was found on-device, where a checklist item nobody could practise ranked #1.
         */
        List<TopicLearningState> eligible = assembled.state().topics().stream()
                .filter(t -> t.questionCount() > 0)
                .sorted(Comparator
                        .comparing(TopicLearningState::examPriority,
                                Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(TopicLearningState::topicName,
                                Comparator.nullsLast(Comparator.naturalOrder())))
                .toList();

        // Rank is assigned before balancing, so the payload can show that a topic was moved.
        Map<UUID, Integer> rankByTopic = new HashMap<>();
        for (int i = 0; i < eligible.size(); i++) {
            rankByTopic.put(eligible.get(i).topicId(), i + 1);
        }

        List<RoadmapTopic> ordered = new ArrayList<>();
        boolean recommendedAssigned = false;
        for (TopicLearningState t : interleaveBySubject(eligible)) {
            RadarTopic radar = radarByTopic.get(t.topicId());

            List<PrerequisiteRef> unmet = radar == null || radar.unmetPrerequisites() == null
                    ? List.of()
                    : radar.unmetPrerequisites();
            boolean prerequisitesMet = unmet.isEmpty();
            boolean mastered = TopicProgressState.MASTERED.name().equals(t.curriculumState());

            // Exactly one "next up", matching the existing prepare-plan endpoint's own rule rather
            // than inventing a second vocabulary for the same idea.
            boolean recommended = !recommendedAssigned && prerequisitesMet && !mastered;
            if (recommended) recommendedAssigned = true;

            WorkloadEstimate estimate =
                    WorkloadEstimator.resolve(t.topicId(), firstDifficulty(radar), timing);
            List<RoadmapStep> steps = stepsFor(radar, estimate);
            Integer minutes = totalMinutes(steps);

            ordered.add(new RoadmapTopic(
                    t.topicId(),
                    t.topicName(),
                    t.subjectId(),
                    t.subjectName(),
                    rankByTopic.getOrDefault(t.topicId(), 0),
                    t.examPriority(),
                    t.curriculumState(),
                    t.performanceState(),
                    t.recommendedAction(),
                    t.questionCount(),
                    prerequisitesMet,
                    unmet.stream().map(PrerequisiteRef::topicName).toList(),
                    recommended,
                    minutes,
                    estimate,
                    steps));
        }

        Integer total = sumMinutes(ordered);

        return new StudyRoadmapResponse(
                assembled.state().examCode(),
                assembled.state().healthAlgorithmVersion(),
                assembled.state().computedAt(),
                timelineFor(examCode, total, now),
                total,
                ordered,
                rollUpBySubject(ordered));
    }

    /* ==================================================================== workload estimates */

    private static String firstDifficulty(RadarTopic radar) {
        if (radar == null || radar.recommendedAction() == null
                || radar.recommendedAction().steps() == null) {
            return null;
        }
        for (ActionStepDto step : radar.recommendedAction().steps()) {
            if (step.difficultyCode() != null) return step.difficultyCode();
        }
        return null;
    }

    private static List<RoadmapStep> stepsFor(RadarTopic radar, WorkloadEstimate estimate) {
        if (radar == null || radar.recommendedAction() == null
                || radar.recommendedAction().steps() == null) {
            return List.of();
        }

        List<RoadmapStep> out = new ArrayList<>();
        for (ActionStepDto step : radar.recommendedAction().steps()) {
            /*
             * A step with no question count is LEARN_CONCEPT, REVISION or TIMED_PRACTICE. There is
             * no concept-learning content in this product to put a duration against, and a timed
             * test's length is the paper's, not this plan's — so these carry a null duration and
             * are excluded from the total. Inventing "15 minutes of concept study" would be exactly
             * the fabricated figure this project refuses everywhere else.
             */
            Integer stepMinutes = step.questionCount() == null
                    ? null
                    : WorkloadEstimator.minutes(step.questionCount(), estimate);
            out.add(new RoadmapStep(step.action(), step.questionCount(), step.difficultyCode(),
                    stepMinutes));
        }
        return out;
    }

    private static Integer totalMinutes(List<RoadmapStep> steps) {
        int total = 0;
        boolean any = false;
        for (RoadmapStep s : steps) {
            if (s.estimatedMinutes() != null) {
                total += s.estimatedMinutes();
                any = true;
            }
        }
        return any ? total : null;
    }

    private static Integer sumMinutes(List<RoadmapTopic> topics) {
        int total = 0;
        boolean any = false;
        for (RoadmapTopic t : topics) {
            if (t.estimatedMinutes() != null) {
                total += t.estimatedMinutes();
                any = true;
            }
        }
        return any ? total : null;
    }

    /* ======================================================================= subject balance */

    /**
     * A stable interleave: walk the priority order and, whenever taking the next topic would make
     * {@link #MAX_CONSECUTIVE_PER_SUBJECT} + 1 in a row from one subject, take the highest-priority
     * topic from a different subject instead. Nothing is dropped and nothing is sorted by anything
     * other than priority — a topic only ever moves later than a topic it outranks, and only to
     * break a run.
     */
    static List<TopicLearningState> interleaveBySubject(List<TopicLearningState> ordered) {
        List<TopicLearningState> remaining = new ArrayList<>(ordered);
        List<TopicLearningState> out = new ArrayList<>(ordered.size());

        UUID lastSubject = null;
        int run = 0;

        while (!remaining.isEmpty()) {
            int pick = 0;
            if (run >= MAX_CONSECUTIVE_PER_SUBJECT) {
                for (int i = 0; i < remaining.size(); i++) {
                    if (!sameSubject(remaining.get(i).subjectId(), lastSubject)) {
                        pick = i;
                        break;
                    }
                }
                // No other subject left: the run continues, because reordering cannot invent
                // variety that the syllabus does not have.
            }

            TopicLearningState chosen = remaining.remove(pick);
            run = sameSubject(chosen.subjectId(), lastSubject) ? run + 1 : 1;
            lastSubject = chosen.subjectId();
            out.add(chosen);
        }

        return out;
    }

    private static boolean sameSubject(UUID a, UUID b) {
        return a == null ? b == null : a.equals(b);
    }

    private static List<RoadmapSubject> rollUpBySubject(List<RoadmapTopic> topics) {
        Map<UUID, int[]> counters = new LinkedHashMap<>();
        Map<UUID, String> names = new LinkedHashMap<>();
        for (RoadmapTopic t : topics) {
            if (t.subjectId() == null) continue;
            names.putIfAbsent(t.subjectId(), t.subjectName());
            // [topicCount, minutes, anyMinutes]
            int[] c = counters.computeIfAbsent(t.subjectId(), id -> new int[3]);
            c[0]++;
            if (t.estimatedMinutes() != null) {
                c[1] += t.estimatedMinutes();
                c[2] = 1;
            }
        }

        List<RoadmapSubject> out = new ArrayList<>();
        for (Map.Entry<UUID, int[]> e : counters.entrySet()) {
            int[] c = e.getValue();
            out.add(new RoadmapSubject(e.getKey(), names.get(e.getKey()), c[0],
                    c[2] == 1 ? c[1] : null));
        }
        out.sort(Comparator.comparing(RoadmapSubject::subjectName,
                Comparator.nullsLast(Comparator.naturalOrder())));
        return out;
    }

    /* ============================================================================= timeline */

    private RoadmapTimeline timelineFor(String examCode, Integer totalMinutes, OffsetDateTime now) {
        Optional<RecruitmentCycle> cycle =
                cycles.findByExamCodeAndCurrentTrueAndContentStatus(examCode, ContentStatus.PUBLISHED);

        if (cycle.isEmpty() || cycle.get().getExamStart() == null) {
            return new RoadmapTimeline(false, null, null, null,
                    "No published exam date for this exam, so this plan is an ordered backlog "
                            + "rather than a schedule.");
        }

        LocalDate examDate = cycle.get().getExamStart();
        long days = ChronoUnit.DAYS.between(now.toLocalDate(), examDate);
        if (days <= 0) {
            return new RoadmapTimeline(true, examDate, null, null,
                    "This exam's date has passed; the plan is shown undated.");
        }

        Integer daily = totalMinutes == null
                ? null
                : (int) Math.max(1, (totalMinutes + days - 1) / days);

        return new RoadmapTimeline(true, examDate, (int) days, daily,
                daily == null
                        ? "Nothing in this plan could be estimated, so no daily figure is shown."
                        : "Finishing everything in this plan by the exam date implies about "
                                + daily + " minutes a day.");
    }
}
