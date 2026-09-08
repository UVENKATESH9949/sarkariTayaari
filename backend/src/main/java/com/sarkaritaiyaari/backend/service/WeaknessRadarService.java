package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.WeaknessRadarDtos.ActionStepDto;
import com.sarkaritaiyaari.backend.dto.WeaknessRadarDtos.AdminRadarResponse;
import com.sarkaritaiyaari.backend.dto.WeaknessRadarDtos.AdminRadarTopic;
import com.sarkaritaiyaari.backend.dto.WeaknessRadarDtos.PrerequisiteRef;
import com.sarkaritaiyaari.backend.dto.WeaknessRadarDtos.RadarOverview;
import com.sarkaritaiyaari.backend.dto.WeaknessRadarDtos.RadarTopic;
import com.sarkaritaiyaari.backend.dto.WeaknessRadarDtos.RecommendedActionDto;
import com.sarkaritaiyaari.backend.dto.WeaknessRadarDtos.WeaknessRadarResponse;
import com.sarkaritaiyaari.backend.entity.EvidenceLevel;
import com.sarkaritaiyaari.backend.entity.ExamTopic;
import com.sarkaritaiyaari.backend.entity.PerformanceTrend;
import com.sarkaritaiyaari.backend.entity.RadarReason;
import com.sarkaritaiyaari.backend.entity.RecommendedAction;
import com.sarkaritaiyaari.backend.entity.Topic;
import com.sarkaritaiyaari.backend.entity.TopicHealthState;
import com.sarkaritaiyaari.backend.entity.TopicPriority;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.entity.UserTopicHealth;
import com.sarkaritaiyaari.backend.repository.DifficultyLevelRepository;
import com.sarkaritaiyaari.backend.repository.ExamRepository;
import com.sarkaritaiyaari.backend.repository.ExamTopicRepository;
import com.sarkaritaiyaari.backend.repository.QuestionRepository;
import com.sarkaritaiyaari.backend.repository.TopicPriorityRepository;
import com.sarkaritaiyaari.backend.repository.TopicRepository;
import com.sarkaritaiyaari.backend.repository.UserRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.UUID;

/**
 * Assembles the Preparation Radar for one student and one exam (Weakness Radar v1 —
 * {@code tasks/TASK-2201-weakness-radar.md}).
 *
 * <h2>Division of labour</h2>
 * {@link TopicHealthService} answers "how is this student doing in this topic" — personal, and
 * the same answer whichever exam they are preparing for. This service answers "so what should
 * they do about it for <em>this</em> exam", which needs three things health knows nothing
 * about: the exam's topic map, Epic L's per-exam topic priority, and whether the question bank
 * can actually serve a recommendation. §13 is explicit that weakness and exam importance are
 * different, and this split is that separation made structural.
 *
 * <p>Nothing here recomputes or re-derives health, and nothing in
 * {@link TopicHealthService} knows what an exam is.
 *
 * <h2>Reuse, not reinvention</h2>
 * Priority comes from {@code topic_priority.final_priority} — Epic L's algorithm, admin
 * overrides already resolved. Question availability comes from
 * {@link QuestionRepository#countByTopicForExam}, the same guard
 * {@link PreparePlanService} applies for the same reason. PYQ availability comes from
 * {@link QuestionRepository#aggregatePyqByTopicAndYear}. Prerequisites come from the existing
 * {@code topic_prerequisites} DAG. §1 asked for no competing sources of truth, and there are
 * none.
 */
@Service
@Transactional
public class WeaknessRadarService {

    /**
     * Accuracy gap, in percentage points, at which PYQ performance is treated as its own
     * problem rather than noise — the §8 case where a student handles practice questions but
     * not the exam's real pattern.
     */
    static final double PYQ_GAP_POINTS = 15.0;

    /** Below this health, the gap reads as conceptual rather than as needing more reps. */
    static final double DEEP_WEAKNESS_HEALTH = 40.0;

    /** Health below which a DEVELOPING topic is sent to foundational rather than medium work. */
    static final double DEVELOPING_FOUNDATION_HEALTH = 55.0;

    /** Consistency below this is called out as variance in its own right (§10). */
    static final double LOW_CONSISTENCY = 50.0;

    /** Exam priority at or above which fixing a topic is worth flagging as high-value (§13). */
    static final double HIGH_EXAM_PRIORITY = 75.0;

    /** Weighted mean health at or above which the whole exam reads as strong. */
    static final double OVERVIEW_STRONG = 70.0;

    /** ...and above which it reads as on track. */
    static final double OVERVIEW_ON_TRACK = 55.0;

    /*
     * The §16 section order. Sorting the flat topic list by this first means grouping by state
     * on the client produces the sections already correctly ordered, without the client
     * knowing the ranking rule.
     */
    private static final Map<TopicHealthState, Integer> SECTION_ORDER = Map.of(
            TopicHealthState.NEEDS_ATTENTION, 0,
            TopicHealthState.NEEDS_REVISION, 1,
            TopicHealthState.IMPROVING, 2,
            TopicHealthState.DEVELOPING, 3,
            TopicHealthState.STRONG, 4,
            TopicHealthState.INSUFFICIENT_DATA, 5);

    private final TopicHealthService topicHealth;
    private final ExamRepository exams;
    private final ExamTopicRepository examTopics;
    private final TopicPriorityRepository priorities;
    private final QuestionRepository questions;
    private final TopicRepository topics;
    private final DifficultyLevelRepository difficultyLevels;
    private final UserRepository users;

    public WeaknessRadarService(TopicHealthService topicHealth,
                                 ExamRepository exams,
                                 ExamTopicRepository examTopics,
                                 TopicPriorityRepository priorities,
                                 QuestionRepository questions,
                                 TopicRepository topics,
                                 DifficultyLevelRepository difficultyLevels,
                                 UserRepository users) {
        this.topicHealth = topicHealth;
        this.exams = exams;
        this.examTopics = examTopics;
        this.priorities = priorities;
        this.questions = questions;
        this.topics = topics;
        this.difficultyLevels = difficultyLevels;
        this.users = users;
    }

    /* ================================================================ student-facing read */

    public WeaknessRadarResponse radarFor(User user, String examCode, boolean forceRecompute) {
        if (!exams.existsById(examCode)) {
            throw new NoSuchElementException("Exam not found: " + examCode);
        }

        List<UserTopicHealth> healthRows = forceRecompute
                ? topicHealth.recompute(user)
                : topicHealth.healthForUser(user);

        Assembled assembled = assemble(examCode, healthRows);

        List<RadarTopic> out = new ArrayList<>();
        for (Scored scored : assembled.scored()) {
            out.add(toRadarTopic(scored, assembled));
        }
        out.sort(radarOrder());

        OffsetDateTime computedAt = healthRows.stream()
                .map(UserTopicHealth::getComputedAt)
                .max(Comparator.naturalOrder())
                .orElse(null);

        return new WeaknessRadarResponse(
                examCode,
                TopicHealthService.ALGORITHM_VERSION,
                computedAt,
                overview(assembled),
                out);
    }

    /* ========================================================================= admin (§22) */

    /**
     * The evidence dump for one student, at full precision.
     *
     * <p>Looks the student up by email rather than taking a user id, because the person asking
     * is a human investigating a support question ("why does the app say I'm weak in Ratio?")
     * and an email is what they have.
     *
     * <p>Read-only: it never triggers a recompute. An admin investigating a complaint needs to
     * see what the student was actually served, not a fresh answer that may no longer show the
     * problem.
     */
    @Transactional(readOnly = true)
    public AdminRadarResponse adminRadarFor(String email, String examCode) {
        User user = users.findByEmail(email)
                .orElseThrow(() -> new NoSuchElementException("No user with email: " + email));
        if (!exams.existsById(examCode)) {
            throw new NoSuchElementException("Exam not found: " + examCode);
        }

        Assembled assembled = assemble(examCode,
                topicHealth.healthForUserWithoutRecompute(user));

        List<AdminRadarTopic> rows = new ArrayList<>();
        for (Scored scored : assembled.scored()) {
            UserTopicHealth h = scored.health();
            if (h == null) continue; // nothing stored yet — nothing to audit
            Recommendation rec = recommend(scored, assembled, unmetPrerequisites(scored, assembled));
            rows.add(new AdminRadarTopic(
                    scored.topic().getId(),
                    scored.topic().getName(),
                    scored.topic().getSubject().getName(),
                    h.getState().name(),
                    h.getHealthScore(),
                    h.getConfidenceScore(),
                    h.getEvidenceLevel().name(),
                    h.getTrendDirection().name(),
                    h.getTrendDelta(),
                    h.getAttemptedCount(),
                    h.getCorrectCount(),
                    h.getRecentAttemptedCount(),
                    h.getRecentAccuracy(),
                    h.getHistoricalAccuracy(),
                    h.getPyqAttemptedCount(),
                    h.getPyqAccuracy(),
                    h.getConsistencyScore(),
                    h.getSpeedRatio(),
                    scored.priority(),
                    interventionValue(scored),
                    rec.primary().name(),
                    rec.reasons().stream().map(Enum::name).toList(),
                    h.getInputs(),
                    h.getLastAttemptAt(),
                    h.getEvidenceThroughAt(),
                    h.getComputedAt()));
        }
        rows.sort(Comparator.comparing(AdminRadarTopic::topicName));

        return new AdminRadarResponse(
                email,
                examCode,
                TopicHealthService.ALGORITHM_VERSION,
                topicHealth.latestAttemptAt(user.getId()),
                rows);
    }

    /* ==================================================================== assembly */

    /**
     * Joins this exam's topic map to the student's health rows, plus the per-exam facts health
     * knows nothing about.
     *
     * <p>Built from {@code exam_topics} outward, the same direction
     * {@code TopicIntelligenceService}'s read path uses: a topic in the exam's syllabus the
     * student has never touched must appear as INSUFFICIENT_DATA rather than be silently
     * absent, because "you have not started this" is exactly the finding §21 asks for.
     *
     * <p>A topic the student <em>has</em> practised but which is not mapped to this exam is
     * deliberately excluded — it is real evidence, but not about this exam's preparation, and
     * showing it would tell the student to spend time on something off-syllabus.
     */
    private Assembled assemble(String examCode, List<UserTopicHealth> healthRows) {
        Map<UUID, UserTopicHealth> healthByTopic = new HashMap<>();
        for (UserTopicHealth row : healthRows) {
            healthByTopic.put(row.getTopic().getId(), row);
        }

        // Relies on hibernate.default_batch_fetch_size (500, set for this project) to resolve
        // the lazy topic/subject in two extra queries rather than one per row — the same thing
        // TopicIntelligenceService's read path relies on for the same list.
        List<ExamTopic> mapped = examTopics.findByExamCodeOrderByTopicName(examCode);

        Map<UUID, Double> priorityByTopic = new HashMap<>();
        for (TopicPriority p : priorities.findForExamAndVersion(
                examCode, TopicIntelligenceService.ALGORITHM_VERSION)) {
            if (p.getFinalPriority() != null) {
                priorityByTopic.put(p.getTopic().getId(), p.getFinalPriority().doubleValue());
            }
        }

        Map<UUID, Long> questionCounts = new HashMap<>();
        for (Object[] row : questions.countByTopicForExam(examCode)) {
            questionCounts.put((UUID) row[0], ((Number) row[1]).longValue());
        }

        // Whether a PYQ step is even offerable. Reuses Epic L's existing per-(topic, year)
        // aggregate rather than a new query; the years themselves are irrelevant here, only
        // that something is tagged.
        Map<UUID, Long> pyqCounts = new HashMap<>();
        for (Object[] row : questions.aggregatePyqByTopicAndYear(examCode)) {
            pyqCounts.merge((UUID) row[0], ((Number) row[2]).longValue(), Long::sum);
        }

        Set<UUID> topicIds = new LinkedHashSet<>();
        for (ExamTopic mapping : mapped) topicIds.add(mapping.getTopic().getId());

        Map<UUID, Topic> withPrerequisites = new HashMap<>();
        if (!topicIds.isEmpty()) {
            for (Topic t : topics.findByIdInWithPrerequisites(topicIds)) {
                withPrerequisites.put(t.getId(), t);
            }
        }

        List<Scored> scored = new ArrayList<>();
        for (ExamTopic mapping : mapped) {
            Topic topic = mapping.getTopic();
            scored.add(new Scored(
                    topic,
                    healthByTopic.get(topic.getId()),
                    priorityByTopic.get(topic.getId()),
                    questionCounts.getOrDefault(topic.getId(), 0L),
                    pyqCounts.getOrDefault(topic.getId(), 0L),
                    withPrerequisites.get(topic.getId())));
        }

        Map<UUID, TopicHealthState> stateByTopic = new HashMap<>();
        for (Scored s : scored) {
            stateByTopic.put(s.topic().getId(), stateOf(s));
        }

        return new Assembled(scored, stateByTopic, easiestDifficultyCode(), hardestDifficultyCode());
    }

    /** A topic with no health row has not been practised — that is INSUFFICIENT_DATA, not weak. */
    private static TopicHealthState stateOf(Scored scored) {
        return scored.health() == null
                ? TopicHealthState.INSUFFICIENT_DATA
                : scored.health().getState();
    }

    private RadarTopic toRadarTopic(Scored scored, Assembled assembled) {
        UserTopicHealth h = scored.health();
        // Computed once and handed to the rule table, rather than computed again inside it:
        // the list the student is shown and the list the recommendation branched on must be
        // the same list.
        List<PrerequisiteRef> unmet = unmetPrerequisites(scored, assembled);
        Recommendation rec = recommend(scored, assembled, unmet);
        Topic topic = scored.topic();

        Integer accuracy = h == null || h.getAttemptedCount() == 0
                ? null
                : (int) Math.round(100.0 * h.getCorrectCount() / h.getAttemptedCount());

        return new RadarTopic(
                topic.getId(),
                topic.getName(),
                topic.getSubject().getId(),
                topic.getSubject().getName(),
                topic.getParent() == null ? null : topic.getParent().getName(),
                stateOf(scored).name(),
                h == null ? 0 : h.getHealthScore().setScale(0, RoundingMode.HALF_UP).intValue(),
                h == null ? PerformanceTrend.NOT_ENOUGH_DATA.name() : h.getTrendDirection().name(),
                h == null || h.getTrendDelta() == null
                        ? null
                        : h.getTrendDelta().setScale(0, RoundingMode.HALF_UP).intValue(),
                h == null ? EvidenceLevel.INSUFFICIENT_DATA.name() : h.getEvidenceLevel().name(),
                h == null ? 0 : h.getAttemptedCount(),
                h == null ? 0 : h.getCorrectCount(),
                accuracy,
                roundOrNull(h == null ? null : h.getRecentAccuracy()),
                roundOrNull(h == null ? null : h.getHistoricalAccuracy()),
                h == null ? 0 : h.getPyqAttemptedCount(),
                roundOrNull(h == null ? null : h.getPyqAccuracy()),
                // Hardcoded false rather than derived from speedRatio: under v1 there is no
                // path by which it could be true, and a client reading a nullable ratio might
                // reasonably default it. See §9.
                false,
                consistencyBand(h),
                scored.priority(),
                interventionValue(scored),
                scored.questionCount(),
                rec.reasons().stream().map(Enum::name).toList(),
                rec.explanation(),
                new RecommendedActionDto(rec.primary().name(), rec.steps()),
                unmet,
                h == null ? null : h.getLastAttemptAt());
    }

    /**
     * §16's sections, in order, each internally ranked by how much fixing the topic is worth.
     *
     * <p>Within a section, a topic with no intervention value (never scored for priority)
     * sorts last rather than first — an unranked topic is not automatically the most urgent.
     */
    private static Comparator<RadarTopic> radarOrder() {
        return Comparator
                .comparingInt((RadarTopic t) -> SECTION_ORDER.getOrDefault(
                        TopicHealthState.valueOf(t.state()), 99))
                .thenComparing(t -> t.interventionValue() == null ? 1 : 0)
                .thenComparing(Comparator.comparingInt(
                        (RadarTopic t) -> t.interventionValue() == null ? 0 : t.interventionValue()).reversed())
                .thenComparing(RadarTopic::topicName);
    }

    /**
     * How much attention this topic is worth, 0-100 (§13).
     *
     * <p>{@code (health gap) x (exam priority) x (confidence)}. All three matter and none
     * dominates: §13's own example — health 62 / priority 94 / confidence 91 beating health 45
     * / priority 32 / confidence 90 — comes out of this directly (57 versus 16).
     *
     * <p>Null when the topic has never been scored for priority. Substituting a midpoint would
     * be inventing an exam-importance judgement nobody made.
     */
    Integer interventionValue(Scored scored) {
        UserTopicHealth h = scored.health();
        if (h == null || scored.priority() == null) return null;
        double gap = (100.0 - h.getHealthScore().doubleValue()) / 100.0;
        double confidence = h.getConfidenceScore().doubleValue() / 100.0;
        return (int) Math.round(gap * scored.priority() * confidence);
    }

    /* ============================================================ the rule table (§14) */

    /**
     * The deterministic recommendation rules. First matching branch wins for the primary
     * action; reason codes accumulate.
     *
     * <p>Deliberately a plain ordered rule table, not a scoring model: §14 requires v1 to be
     * deterministic and §24 rules out an LLM or an adaptive engine. It is also what makes the
     * §23 cases assertable — each branch is reachable by a fixture.
     */
    Recommendation recommend(Scored scored, Assembled assembled, List<PrerequisiteRef> unmet) {
        UserTopicHealth h = scored.health();
        TopicHealthState state = stateOf(scored);
        List<RadarReason> reasons = new ArrayList<>();
        List<ActionStepDto> steps = new ArrayList<>();
        RecommendedAction primary;

        boolean canPractice = scored.questionCount() > 0;
        boolean pyqAvailable = scored.pyqQuestionCount() > 0;
        double health = h == null ? 0 : h.getHealthScore().doubleValue();

        boolean pyqGap = h != null
                && h.getPyqAccuracy() != null
                && h.getAttemptedCount() > 0
                && (100.0 * h.getCorrectCount() / h.getAttemptedCount())
                        - h.getPyqAccuracy().doubleValue() >= PYQ_GAP_POINTS;

        if (!canPractice) {
            /*
             * The bank has nothing for this topic and exam. Recommending "practice 10
             * questions" would send the student to an empty screen — the same failure
             * PreparePlanService already guards against, found on-device rather than by review.
             */
            reasons.add(RadarReason.NO_QUESTIONS_AVAILABLE);
            primary = state == TopicHealthState.INSUFFICIENT_DATA
                    ? RecommendedAction.LEARN_CONCEPT
                    : RecommendedAction.REVISION;
            steps.add(new ActionStepDto(RecommendedAction.LEARN_CONCEPT.name(), null, null));
        } else if (!unmet.isEmpty()
                && (state.isConcern() || state == TopicHealthState.INSUFFICIENT_DATA)) {
            // Sequencing beats effort here: drilling a topic whose prerequisite is shaky
            // mostly produces frustration, which is what the prerequisite DAG exists to avoid.
            reasons.add(RadarReason.PREREQUISITE_GAP);
            primary = RecommendedAction.LEARN_CONCEPT;
            steps.add(new ActionStepDto(RecommendedAction.LEARN_CONCEPT.name(), null, null));
            steps.add(new ActionStepDto(RecommendedAction.PRACTICE_FOUNDATIONAL.name(), 10,
                    assembled.easiestDifficulty()));
        } else {
            switch (state) {
                case INSUFFICIENT_DATA -> {
                    reasons.add(RadarReason.NOT_ENOUGH_PRACTICE);
                    primary = RecommendedAction.GATHER_EVIDENCE;
                    steps.add(new ActionStepDto(RecommendedAction.PRACTICE_FOUNDATIONAL.name(), 10,
                            assembled.easiestDifficulty()));
                }
                case NEEDS_REVISION -> {
                    reasons.add(RadarReason.RECENT_DECLINE);
                    primary = RecommendedAction.REVISION;
                    steps.add(new ActionStepDto(RecommendedAction.REVISION.name(), null, null));
                    steps.add(new ActionStepDto(RecommendedAction.PRACTICE_MEDIUM.name(), 10, null));
                    if (pyqAvailable) {
                        steps.add(new ActionStepDto(RecommendedAction.PRACTICE_PYQ.name(), 10, null));
                    }
                    steps.add(new ActionStepDto(RecommendedAction.TIMED_PRACTICE.name(), null, null));
                }
                case NEEDS_ATTENTION -> {
                    if (health < DEEP_WEAKNESS_HEALTH) {
                        // §14's worked example, in the order it gives.
                        reasons.add(RadarReason.LOW_ACCURACY);
                        primary = RecommendedAction.LEARN_CONCEPT;
                        steps.add(new ActionStepDto(RecommendedAction.LEARN_CONCEPT.name(), null, null));
                        steps.add(new ActionStepDto(RecommendedAction.PRACTICE_FOUNDATIONAL.name(), 10,
                                assembled.easiestDifficulty()));
                        steps.add(new ActionStepDto(RecommendedAction.PRACTICE_MEDIUM.name(), 15, null));
                        if (pyqAvailable) {
                            steps.add(new ActionStepDto(RecommendedAction.PRACTICE_PYQ.name(), 10, null));
                        }
                        steps.add(new ActionStepDto(RecommendedAction.TIMED_PRACTICE.name(), null, null));
                    } else if (pyqGap && pyqAvailable) {
                        reasons.add(RadarReason.PYQ_GAP);
                        primary = RecommendedAction.PRACTICE_PYQ;
                        steps.add(new ActionStepDto(RecommendedAction.PRACTICE_PYQ.name(), 10, null));
                        steps.add(new ActionStepDto(RecommendedAction.PRACTICE_MEDIUM.name(), 10, null));
                        steps.add(new ActionStepDto(RecommendedAction.TIMED_PRACTICE.name(), null, null));
                    } else {
                        reasons.add(RadarReason.LOW_ACCURACY);
                        primary = RecommendedAction.PRACTICE_MEDIUM;
                        steps.add(new ActionStepDto(RecommendedAction.PRACTICE_MEDIUM.name(), 15, null));
                        if (pyqAvailable) {
                            steps.add(new ActionStepDto(RecommendedAction.PRACTICE_PYQ.name(), 10, null));
                        }
                        steps.add(new ActionStepDto(RecommendedAction.TIMED_PRACTICE.name(), null, null));
                    }
                }
                case IMPROVING -> {
                    // Keep doing what is working, at the next difficulty up — not a warning.
                    reasons.add(RadarReason.IMPROVING_FAST);
                    primary = RecommendedAction.PRACTICE_MEDIUM;
                    steps.add(new ActionStepDto(RecommendedAction.PRACTICE_MEDIUM.name(), 15, null));
                    if (pyqAvailable) {
                        steps.add(new ActionStepDto(RecommendedAction.PRACTICE_PYQ.name(), 10, null));
                    }
                }
                case STRONG -> {
                    if (pyqGap && pyqAvailable) {
                        reasons.add(RadarReason.PYQ_GAP);
                        primary = RecommendedAction.PRACTICE_PYQ;
                        steps.add(new ActionStepDto(RecommendedAction.PRACTICE_PYQ.name(), 10, null));
                    } else {
                        reasons.add(RadarReason.STRONG_AND_STABLE);
                        primary = RecommendedAction.MAINTENANCE_PRACTICE;
                        steps.add(new ActionStepDto(RecommendedAction.PRACTICE_ADVANCED.name(), 10,
                                assembled.hardestDifficulty()));
                    }
                }
                default -> {
                    // DEVELOPING: real evidence, no verdict yet. The action is to build the
                    // evidence up, at a level matched to where they are.
                    if (h != null && h.getEvidenceLevel() != EvidenceLevel.RELIABLE) {
                        reasons.add(RadarReason.NOT_ENOUGH_PRACTICE);
                    } else {
                        reasons.add(RadarReason.LOW_ACCURACY);
                    }
                    if (health < DEVELOPING_FOUNDATION_HEALTH) {
                        primary = RecommendedAction.PRACTICE_FOUNDATIONAL;
                        steps.add(new ActionStepDto(RecommendedAction.PRACTICE_FOUNDATIONAL.name(), 10,
                                assembled.easiestDifficulty()));
                        steps.add(new ActionStepDto(RecommendedAction.PRACTICE_MEDIUM.name(), 10, null));
                    } else {
                        primary = RecommendedAction.PRACTICE_MEDIUM;
                        steps.add(new ActionStepDto(RecommendedAction.PRACTICE_MEDIUM.name(), 15, null));
                    }
                }
            }
        }

        /*
         * Secondary reasons, appended regardless of which branch produced the plan. They
         * change the copy the student reads and the ranking, not the plan itself — which is
         * what §13 asks for: priority raises urgency without redefining the fix.
         */
        if (pyqGap && !reasons.contains(RadarReason.PYQ_GAP)) {
            reasons.add(RadarReason.PYQ_GAP);
        }
        if (h != null && h.getConsistencyScore() != null
                && h.getConsistencyScore().doubleValue() < LOW_CONSISTENCY) {
            reasons.add(RadarReason.HIGH_VARIANCE);
        }
        if (scored.priority() != null && scored.priority() >= HIGH_EXAM_PRIORITY) {
            reasons.add(RadarReason.HIGH_EXAM_WEIGHT);
        }
        if (h != null && Boolean.TRUE.equals(
                h.getInputs() == null ? null : h.getInputs().get("staleRecentWindow"))) {
            reasons.add(RadarReason.STALE_PRACTICE);
        }

        return new Recommendation(primary, steps, reasons, explain(scored, state, reasons));
    }

    /**
     * One plain sentence, from the reason codes.
     *
     * <p>The mobile client renders its own localised copy from {@code reasonCodes} and never
     * shows this; it exists so the payload is self-describing for the admin view and for any
     * client without a string table. Tone follows §17 — the topic needs attention, the student
     * is not deficient.
     */
    private static String explain(Scored scored, TopicHealthState state, List<RadarReason> reasons) {
        String name = scored.topic().getName();
        if (reasons.contains(RadarReason.NO_QUESTIONS_AVAILABLE)) {
            return name + " has no practice questions for this exam yet, so start with the concept.";
        }
        if (reasons.contains(RadarReason.PREREQUISITE_GAP)) {
            return name + " builds on a topic that is not solid yet — that one first.";
        }
        return switch (state) {
            case INSUFFICIENT_DATA ->
                    "Not enough practice in " + name + " yet to judge it either way.";
            case NEEDS_REVISION ->
                    name + " used to be one of your stronger topics and has slipped recently.";
            case NEEDS_ATTENTION -> reasons.contains(RadarReason.PYQ_GAP)
                    ? name + " is fine on practice questions but weaker on real exam-style ones."
                    : name + " needs more attention right now — accuracy is below your target.";
            case IMPROVING -> name + " is improving clearly. Keep going.";
            case STRONG -> reasons.contains(RadarReason.PYQ_GAP)
                    ? name + " is strong overall, but real exam-style questions are still tripping you up."
                    : name + " is one of your reliable topics.";
            default -> reasons.contains(RadarReason.HIGH_VARIANCE)
                    ? name + " swings a lot between sessions — steadier practice will settle it."
                    : name + " is coming along; a bit more practice will make the picture clear.";
        };
    }

    /**
     * Prerequisite topics that are not solid yet.
     *
     * <p>Judged by <em>radar</em> state, not by the {@code user_topic_progress} mastery ladder
     * that {@link PreparePlanService} uses. Two reasons: this feature would otherwise mix two
     * vocabularies in one sentence, and the mastery ladder cannot express "was strong, has
     * declined" for a prerequisite, which is precisely when a prerequisite warning matters.
     */
    private static List<PrerequisiteRef> unmetPrerequisites(Scored scored, Assembled assembled) {
        Topic withPrereqs = scored.prerequisiteSource();
        if (withPrereqs == null || withPrereqs.getPrerequisites().isEmpty()) return List.of();
        List<PrerequisiteRef> out = new ArrayList<>();
        for (Topic prereq : withPrereqs.getPrerequisites()) {
            TopicHealthState state = assembled.stateByTopic().get(prereq.getId());
            // A prerequisite outside this exam's topic map has no state here. Not treated as
            // unmet: absence of evidence about an off-syllabus topic is not a warning.
            if (state == null) continue;
            if (state == TopicHealthState.STRONG || state == TopicHealthState.IMPROVING) continue;
            out.add(new PrerequisiteRef(prereq.getId(), prereq.getName(), state.name()));
        }
        return out;
    }

    /* ------------------------------------------------------------------------- overview */

    private RadarOverview overview(Assembled assembled) {
        Map<TopicHealthState, Integer> counts = new LinkedHashMap<>();
        for (TopicHealthState state : TopicHealthState.values()) counts.put(state, 0);

        int withEvidence = 0;
        int reliable = 0;
        double weightedHealth = 0;
        double weightTotal = 0;

        for (Scored scored : assembled.scored()) {
            TopicHealthState state = stateOf(scored);
            counts.merge(state, 1, Integer::sum);
            UserTopicHealth h = scored.health();
            if (h == null) continue;
            withEvidence++;
            if (h.getEvidenceLevel() == EvidenceLevel.RELIABLE) reliable++;
            // Weighted by exam priority, so an exam's readout reflects the topics that
            // actually carry it. Unscored topics still count, at weight 1, rather than being
            // dropped from the student's own overall picture.
            double weight = scored.priority() == null ? 1.0 : Math.max(1.0, scored.priority());
            weightedHealth += weight * h.getHealthScore().doubleValue();
            weightTotal += weight;
        }

        String status;
        if (withEvidence == 0) {
            status = "NO_DATA";
        } else if (reliable == 0) {
            status = "GETTING_STARTED";
        } else {
            double mean = weightedHealth / weightTotal;
            status = mean >= OVERVIEW_STRONG ? "STRONG" : mean >= OVERVIEW_ON_TRACK ? "ON_TRACK" : "BUILDING";
        }

        return new RadarOverview(
                status,
                assembled.scored().size(),
                withEvidence,
                reliable,
                counts.get(TopicHealthState.NEEDS_ATTENTION),
                counts.get(TopicHealthState.NEEDS_REVISION),
                counts.get(TopicHealthState.IMPROVING),
                counts.get(TopicHealthState.STRONG),
                counts.get(TopicHealthState.DEVELOPING),
                counts.get(TopicHealthState.INSUFFICIENT_DATA),
                headline(status, counts.get(TopicHealthState.NEEDS_ATTENTION)));
    }

    private static String headline(String status, int needsAttention) {
        return switch (status) {
            case "NO_DATA" -> "Practise a few topics and your radar will start filling in.";
            case "GETTING_STARTED" -> "Early days — a bit more practice and this gets much sharper.";
            case "STRONG" -> "You're in good shape across this exam's syllabus.";
            case "ON_TRACK" -> needsAttention == 0
                    ? "On track. Nothing needs urgent attention right now."
                    : "On track, with " + needsAttention + " topic(s) worth focusing on.";
            default -> needsAttention == 0
                    ? "Still building. Keep practising across the syllabus."
                    : "Still building — " + needsAttention + " topic(s) are the highest-value fixes.";
        };
    }

    /* ------------------------------------------------------------------------- plumbing */

    /**
     * The easiest active difficulty's code, for a "foundational practice" step.
     *
     * <p>Read from {@code difficulty_levels} rather than hardcoding {@code "easy"}: difficulty
     * is admin-editable data in this project by design (V3), and a hardcoded code would break
     * silently the moment someone renames or reorders a level.
     */
    private String easiestDifficultyCode() {
        var levels = difficultyLevels.findByActiveTrueOrderByDisplayOrderAsc();
        return levels.isEmpty() ? null : levels.get(0).getCode();
    }

    private String hardestDifficultyCode() {
        var levels = difficultyLevels.findByActiveTrueOrderByDisplayOrderAsc();
        return levels.isEmpty() ? null : levels.get(levels.size() - 1).getCode();
    }

    private static String consistencyBand(UserTopicHealth h) {
        if (h == null || h.getConsistencyScore() == null) return "UNKNOWN";
        return h.getConsistencyScore().doubleValue() >= LOW_CONSISTENCY ? "STEADY" : "VARIABLE";
    }

    private static Integer roundOrNull(BigDecimal value) {
        return value == null ? null : value.setScale(0, RoundingMode.HALF_UP).intValue();
    }

    /* --------------------------------------------------------------------- value types */

    /** One exam-mapped topic plus everything needed to turn its health into advice. */
    record Scored(Topic topic,
                   UserTopicHealth health,
                   Double priority,
                   long questionCount,
                   long pyqQuestionCount,
                   Topic prerequisiteSource) {
    }

    /** The per-request join, computed once so no rule below issues its own query. */
    record Assembled(List<Scored> scored,
                      Map<UUID, TopicHealthState> stateByTopic,
                      String easiestDifficulty,
                      String hardestDifficulty) {
    }

    record Recommendation(RecommendedAction primary,
                           List<ActionStepDto> steps,
                           List<RadarReason> reasons,
                           String explanation) {
    }
}
