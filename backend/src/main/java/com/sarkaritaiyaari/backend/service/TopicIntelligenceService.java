package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.TopicIntelligenceDtos;
import com.sarkaritaiyaari.backend.entity.Exam;
import com.sarkaritaiyaari.backend.entity.ExamTopic;
import com.sarkaritaiyaari.backend.entity.Topic;
import com.sarkaritaiyaari.backend.entity.TopicPriority;
import com.sarkaritaiyaari.backend.entity.TopicTrend;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.repository.ExamRepository;
import com.sarkaritaiyaari.backend.repository.ExamTopicRepository;
import com.sarkaritaiyaari.backend.repository.QuestionRepository;
import com.sarkaritaiyaari.backend.repository.TopicPriorityRepository;
import com.sarkaritaiyaari.backend.repository.TopicTrendRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;

/**
 * Computes per-exam topic trend and priority from PYQ-tagged questions, and applies admin
 * overrides (Epic L / TICKET-2106 and TICKET-2107).
 *
 * <h2>Why the version is a constant in code</h2>
 * {@link #ALGORITHM_VERSION} is bumped by hand whenever any part of {@link #scoreTopic} or
 * {@link #computeTrend} changes. Supplied §65/§67 require a stored score to stay explainable
 * after the formula changes; recording the version per row is what makes the old rows
 * readable instead of silently reinterpreted. Rows from a previous version are left on disk
 * — {@link #recompute} only clears the version it is about to write.
 *
 * <h2>What this does not do</h2>
 * There is no AI, no OCR and no PDF ingestion here, and deliberately so — see
 * preparation-os-requirements.md §18.5's first decision. Trend is computed from whatever an
 * admin has tagged with {@code pyq_year}. Until something is tagged, every topic reports
 * {@code INSUFFICIENT_DATA}, which is the honest answer rather than a fabricated zero.
 */
@Service
@Transactional
public class TopicIntelligenceService {

    /**
     * Bump on any formula change. See the class comment.
     *
     * <p>v2: the computed weightage is now normalised against the exam's busiest mapped topic
     * instead of being used as a raw share of total appearances. Under v1 the weightage term
     * contributed under a point to a 0-100 score while trend contributed thirty, so the ranking
     * was effectively trend-only. Bumped rather than edited in place precisely so any v1 rows
     * still on disk stay identifiable as having been produced by the old, wrong formula -
     * which is the whole reason the version is stored per row.
     */
    public static final String ALGORITHM_VERSION = "v2";

    /**
     * Below this many tagged appearances a topic has no trend worth reporting. Two is the
     * floor at which "more than last time" is even expressible; the year check below is the
     * one that actually matters.
     */
    private static final int MIN_APPEARANCES_FOR_TREND = 3;

    /** A trend needs at least this many distinct years, or there is no time axis at all. */
    private static final int MIN_YEARS_FOR_TREND = 2;

    /**
     * Appearances-per-year has to move by more than this fraction before it is called a
     * trend rather than noise. 15% is a judgement call, not a derived constant — with a
     * handful of tagged papers per exam, a smaller threshold would label ordinary
     * year-to-year variation as a rising or falling topic.
     */
    private static final BigDecimal TREND_NOISE_FLOOR = new BigDecimal("0.15");

    /** Question count at which a topic counts as fully covered by the bank. */
    private static final BigDecimal COVERAGE_TARGET = new BigDecimal("50");

    /*
     * Priority weights. They sum to 1.00 and that is asserted at startup below, because a
     * silent drift here would rescale every score in the system with no visible symptom.
     *
     * Relative weightage dominates: how much of the paper a topic is worth is the strongest
     * single signal about whether a student should spend time on it. Trend is a genuine but
     * secondary adjustment. Coverage is smallest and is about us, not the exam — it says how
     * well the question bank can actually serve the topic, which matters for whether
     * recommending it is useful, not for whether it is important.
     */
    private static final BigDecimal W_WEIGHTAGE = new BigDecimal("0.55");
    private static final BigDecimal W_TREND = new BigDecimal("0.30");
    private static final BigDecimal W_COVERAGE = new BigDecimal("0.15");

    private static final BigDecimal HUNDRED = new BigDecimal("100");

    static {
        BigDecimal sum = W_WEIGHTAGE.add(W_TREND).add(W_COVERAGE);
        if (sum.compareTo(BigDecimal.ONE) != 0) {
            throw new IllegalStateException("Priority weights must sum to 1.00 but sum to " + sum);
        }
    }

    private final ExamRepository exams;
    private final ExamTopicRepository examTopics;
    private final QuestionRepository questions;
    private final TopicTrendRepository trends;
    private final TopicPriorityRepository priorities;

    public TopicIntelligenceService(ExamRepository exams,
                                     ExamTopicRepository examTopics,
                                     QuestionRepository questions,
                                     TopicTrendRepository trends,
                                     TopicPriorityRepository priorities) {
        this.exams = exams;
        this.examTopics = examTopics;
        this.questions = questions;
        this.trends = trends;
        this.priorities = priorities;
    }

    /* ------------------------------------------------------------------- Recompute */

    /**
     * Recomputes trend and priority for one exam's mapped topics.
     *
     * <p>Scoped to the topics in {@code exam_topics}: a topic nobody has said is relevant to
     * this exam should not acquire a priority for it just because a question happens to be
     * tagged both ways. That also keeps the admin's curation the thing that defines scope.
     *
     * <p>Existing overrides are read <em>before</em> the delete and re-applied afterwards.
     * Without that step, bumping {@link #ALGORITHM_VERSION} would produce a fresh set of rows
     * with {@code admin_override = null} and quietly discard every editorial decision ever
     * made — the precise outcome §66 exists to prevent.
     */
    public TopicIntelligenceDtos.RecomputeResponse recompute(String examCode) {
        Exam exam = requireExam(examCode);

        Map<UUID, BigDecimal> preservedOverrides = new HashMap<>();
        Map<UUID, String> preservedReasons = new HashMap<>();
        Map<UUID, UUID> preservedBy = new HashMap<>();
        Map<UUID, OffsetDateTime> preservedAt = new HashMap<>();
        /*
         * A projection, so nothing is left managed when the bulk delete below runs - see
         * TopicPriorityRepository.findOverridesForExam for why that matters.
         *
         * putIfAbsent semantics, not overwrite: the query returns newest-first across every
         * algorithm version, and superseded versions stay on disk by design. Overwriting would let
         * a stale v1 override resurrect one an admin has since cleared on the current version.
         */
        for (Object[] row : priorities.findOverridesForExam(examCode)) {
            UUID topicId = (UUID) row[0];
            if (preservedOverrides.containsKey(topicId)) continue;
            preservedOverrides.put(topicId, (BigDecimal) row[1]);
            preservedReasons.put(topicId, (String) row[2]);
            preservedBy.put(topicId, (UUID) row[3]);
            preservedAt.put(topicId, (OffsetDateTime) row[4]);
        }

        List<ExamTopic> mapped = examTopics.findByExamCodeOrderByTopicName(examCode);
        Map<UUID, Map<Integer, Long>> pyqByTopic = pyqHistogram(examCode);
        Map<UUID, Long> questionCounts = questionCountsByTopic(examCode);

        long totalAppearances = pyqByTopic.values().stream()
                .flatMap(byYear -> byYear.values().stream())
                .mapToLong(Long::longValue)
                .sum();

        // Replace this version's rows wholesale. Flushed before the inserts for the same
        // reason ExamService.setTopics does: the natural-key UNIQUE would otherwise be
        // violated by a re-scored topic, since Hibernate is free to order the insert first.
        trends.deleteByExamCodeAndVersion(examCode, ALGORITHM_VERSION);
        priorities.deleteByExamCodeAndVersion(examCode, ALGORITHM_VERSION);
        trends.flush();
        priorities.flush();

        BigDecimal maxCuratedWeightage = mapped.stream()
                .map(ExamTopic::getWeightagePercent)
                .filter(w -> w != null)
                .max(Comparator.naturalOrder())
                .orElse(BigDecimal.ZERO);

        /*
         * The highest appearance count among this exam's *mapped* topics, so the computed
         * weightage can be normalised the same way the curated one is.
         *
         * Not an optimisation - a correctness fix found by reading real seeded output. The
         * computed weightage is a share of the exam's total appearances, so across 61 topics it
         * averages ~1.6% and peaks around 4%. Feeding that straight into a 0-100 blend meant
         * the weightage term contributed under one point while trend contributed thirty, so
         * the ranking was driven almost entirely by trend despite weightage carrying the
         * largest declared weight. Normalising against the exam's own maximum makes the
         * weights mean what they say.
         *
         * Scoped to mapped topics, not every topic with PYQ data: an unmapped topic is out of
         * scope for this exam, and letting one set the ceiling would compress every in-scope
         * topic toward zero.
         */
        long maxAppearances = mapped.stream()
                .mapToLong(m -> pyqByTopic.getOrDefault(m.getTopic().getId(), Map.of())
                        .values().stream().mapToLong(Long::longValue).sum())
                .max()
                .orElse(0L);

        OffsetDateTime now = OffsetDateTime.now();
        List<TopicTrend> trendRows = new ArrayList<>();
        List<TopicPriority> priorityRows = new ArrayList<>();

        for (ExamTopic mapping : mapped) {
            Topic topic = mapping.getTopic();
            Map<Integer, Long> byYear = pyqByTopic.getOrDefault(topic.getId(), Map.of());
            long appearances = byYear.values().stream().mapToLong(Long::longValue).sum();

            TrendResult trend = computeTrend(byYear);
            BigDecimal computedWeightage = totalAppearances > 0
                    ? BigDecimal.valueOf(appearances)
                        .multiply(HUNDRED)
                        .divide(BigDecimal.valueOf(totalAppearances), 2, RoundingMode.HALF_UP)
                    : null;

            TopicTrend trendRow = new TopicTrend();
            trendRow.setId(TopicTrend.idFor(examCode, topic.getId(), ALGORITHM_VERSION));
            trendRow.setExam(exam);
            trendRow.setTopic(topic);
            trendRow.setAlgorithmVersion(ALGORITHM_VERSION);
            trendRow.setWindowFromYear(trend.fromYear);
            trendRow.setWindowToYear(trend.toYear);
            trendRow.setAppearanceCount((int) appearances);
            trendRow.setComputedWeightagePercent(computedWeightage);
            trendRow.setTrendDirection(trend.direction);
            trendRow.setTrendScore(trend.score);
            trendRow.setInputs(new LinkedHashMap<>(Map.of(
                    "appearancesByYear", new TreeMap<>(byYear),
                    "totalExamAppearances", totalAppearances,
                    "minAppearancesForTrend", MIN_APPEARANCES_FOR_TREND,
                    "minYearsForTrend", MIN_YEARS_FOR_TREND,
                    "noiseFloor", TREND_NOISE_FLOOR.toPlainString()
            )));
            trendRow.setComputedAt(now);
            trendRows.add(trendRow);

            ScoreResult score = scoreTopic(
                    mapping.getWeightagePercent(),
                    computedWeightage,
                    maxCuratedWeightage,
                    appearances,
                    maxAppearances,
                    trend,
                    questionCounts.getOrDefault(topic.getId(), 0L));

            TopicPriority priorityRow = new TopicPriority();
            priorityRow.setId(TopicPriority.idFor(examCode, topic.getId(), ALGORITHM_VERSION));
            priorityRow.setExam(exam);
            priorityRow.setTopic(topic);
            priorityRow.setAlgorithmVersion(ALGORITHM_VERSION);
            priorityRow.setSystemPriority(score.priority);
            priorityRow.setAdminOverride(preservedOverrides.get(topic.getId()));
            priorityRow.setOverrideReason(preservedReasons.get(topic.getId()));
            priorityRow.setOverrideBy(preservedBy.get(topic.getId()));
            priorityRow.setOverrideAt(preservedAt.get(topic.getId()));
            priorityRow.recomputeFinalPriority();
            priorityRow.setInputs(score.inputs);
            priorityRow.setComputedAt(now);
            priorityRows.add(priorityRow);
        }

        trends.saveAll(trendRows);
        priorities.saveAll(priorityRows);

        long pyqTagged = pyqByTopic.values().stream()
                .flatMap(m -> m.values().stream())
                .mapToLong(Long::longValue)
                .sum();

        int carriedForward = (int) mapped.stream()
                .filter(m -> preservedOverrides.containsKey(m.getTopic().getId()))
                .count();

        return new TopicIntelligenceDtos.RecomputeResponse(
                examCode, ALGORITHM_VERSION, mapped.size(), pyqTagged, carriedForward);
    }

    /* ----------------------------------------------------------------------- Trend */

    /** Trend verdict plus the window it was computed over. */
    private static final class TrendResult {
        TopicTrend.Direction direction = TopicTrend.Direction.INSUFFICIENT_DATA;
        BigDecimal score;
        Integer fromYear;
        Integer toYear;
        /** 0.0-1.0, fed into the priority score. Neutral when there is no trend. */
        BigDecimal normalised = new BigDecimal("0.50");
    }

    /**
     * Splits the tagged years into an older and a more recent half and compares
     * appearances-per-year between them.
     *
     * <p>A slope over so few points would be more impressive and less honest — with three or
     * four tagged years, a least-squares fit is dominated by whichever year happens to be
     * missing. Halves are robust at this sample size, and the whole thing is replaced by a
     * better estimator under a new {@link #ALGORITHM_VERSION} once real PYQ data exists at
     * volume.
     *
     * <p>The middle year of an odd-length window goes to the recent half deliberately: with
     * three years, treating the middle as "old" would mean comparing one year against two
     * and calling the result a direction.
     */
    private TrendResult computeTrend(Map<Integer, Long> appearancesByYear) {
        TrendResult result = new TrendResult();
        if (appearancesByYear.isEmpty()) {
            return result;
        }

        TreeMap<Integer, Long> sorted = new TreeMap<>(appearancesByYear);
        result.fromYear = sorted.firstKey();
        result.toYear = sorted.lastKey();

        long total = sorted.values().stream().mapToLong(Long::longValue).sum();
        List<Integer> years = new ArrayList<>(sorted.keySet());

        if (total < MIN_APPEARANCES_FOR_TREND || years.size() < MIN_YEARS_FOR_TREND) {
            return result;
        }

        int split = years.size() / 2;
        List<Integer> olderYears = years.subList(0, split);
        List<Integer> recentYears = years.subList(split, years.size());

        BigDecimal olderRate = ratePerYear(sorted, olderYears);
        BigDecimal recentRate = ratePerYear(sorted, recentYears);

        if (olderRate.compareTo(BigDecimal.ZERO) == 0) {
            // Nothing in the older half but something in the recent one: unambiguously new
            // material, not a divide-by-zero to be papered over.
            result.direction = recentRate.compareTo(BigDecimal.ZERO) > 0
                    ? TopicTrend.Direction.RISING
                    : TopicTrend.Direction.INSUFFICIENT_DATA;
            result.score = recentRate.compareTo(BigDecimal.ZERO) > 0 ? HUNDRED : null;
            result.normalised = result.direction == TopicTrend.Direction.RISING
                    ? BigDecimal.ONE
                    : new BigDecimal("0.50");
            return result;
        }

        BigDecimal delta = recentRate.subtract(olderRate)
                .divide(olderRate, 4, RoundingMode.HALF_UP);

        result.score = delta.multiply(HUNDRED).setScale(2, RoundingMode.HALF_UP);

        if (delta.abs().compareTo(TREND_NOISE_FLOOR) < 0) {
            result.direction = TopicTrend.Direction.STABLE;
            result.normalised = new BigDecimal("0.60");
        } else if (delta.signum() > 0) {
            result.direction = TopicTrend.Direction.RISING;
            result.normalised = BigDecimal.ONE;
        } else {
            result.direction = TopicTrend.Direction.FALLING;
            result.normalised = new BigDecimal("0.25");
        }
        return result;
    }

    private static BigDecimal ratePerYear(Map<Integer, Long> byYear, List<Integer> years) {
        if (years.isEmpty()) return BigDecimal.ZERO;
        long sum = years.stream().mapToLong(y -> byYear.getOrDefault(y, 0L)).sum();
        return BigDecimal.valueOf(sum).divide(BigDecimal.valueOf(years.size()), 4, RoundingMode.HALF_UP);
    }

    /* -------------------------------------------------------------------- Priority */

    private static final class ScoreResult {
        BigDecimal priority;
        Map<String, Object> inputs;
    }

    /**
     * Blends relative weightage, trend and bank coverage into a 0-100 priority.
     *
     * <p>Weightage is normalised against the highest weightage in the same exam rather than
     * used as an absolute percentage. With ~108 topics, a genuinely important topic might
     * still only be 4% of a paper, so an absolute reading would compress every topic into
     * the bottom of the scale and make the ranking useless. Normalising per exam also means
     * an exam whose weightages have not been curated in the same units as another's still
     * ranks sensibly within itself.
     *
     * <p>The computed weightage is preferred over the curated one when PYQ data exists, and
     * {@code weightageSource} records which was used — otherwise a reader cannot tell a
     * score built from real evidence from one built from an admin's estimate.
     */
    private ScoreResult scoreTopic(BigDecimal curatedWeightage,
                                    BigDecimal computedWeightage,
                                    BigDecimal maxCuratedWeightage,
                                    long appearances,
                                    long maxAppearances,
                                    TrendResult trend,
                                    long questionCount) {
        String weightageSource;
        BigDecimal relativeWeightage;

        if (computedWeightage != null && computedWeightage.compareTo(BigDecimal.ZERO) > 0
                && maxAppearances > 0) {
            // Normalised against the busiest mapped topic in this exam, NOT used as an absolute
            // percentage. See the maxAppearances comment in recompute for why the absolute
            // reading made the declared weights meaningless.
            weightageSource = "COMPUTED_FROM_PYQ";
            relativeWeightage = BigDecimal.valueOf(appearances)
                    .multiply(HUNDRED)
                    .divide(BigDecimal.valueOf(maxAppearances), 2, RoundingMode.HALF_UP)
                    .min(HUNDRED);
        } else if (curatedWeightage != null && maxCuratedWeightage.compareTo(BigDecimal.ZERO) > 0) {
            weightageSource = "ADMIN_CURATED";
            relativeWeightage = curatedWeightage
                    .multiply(HUNDRED)
                    .divide(maxCuratedWeightage, 2, RoundingMode.HALF_UP)
                    .min(HUNDRED);
        } else {
            // Neither figure exists. A neutral midpoint, not zero: "nobody has assessed this
            // topic" is not the same claim as "this topic does not matter", and scoring it 0
            // would bury it below topics that were actively assessed as unimportant.
            weightageSource = "NONE";
            relativeWeightage = new BigDecimal("50");
        }

        BigDecimal coverage = BigDecimal.valueOf(questionCount)
                .multiply(HUNDRED)
                .divide(COVERAGE_TARGET, 2, RoundingMode.HALF_UP)
                .min(HUNDRED);

        BigDecimal trendComponent = trend.normalised.multiply(HUNDRED);

        BigDecimal priority = relativeWeightage.multiply(W_WEIGHTAGE)
                .add(trendComponent.multiply(W_TREND))
                .add(coverage.multiply(W_COVERAGE))
                .setScale(2, RoundingMode.HALF_UP)
                .max(BigDecimal.ZERO)
                .min(HUNDRED);

        ScoreResult result = new ScoreResult();
        result.priority = priority;
        // LinkedHashMap so the stored JSON reads in a deliberate order rather than a hash
        // order that shuffles between JVM runs and makes diffs unreadable.
        Map<String, Object> inputs = new LinkedHashMap<>();
        inputs.put("weightageSource", weightageSource);
        inputs.put("relativeWeightage", relativeWeightage.toPlainString());
        // Both recorded so the normalisation itself is auditable, not just its result.
        inputs.put("appearances", appearances);
        inputs.put("maxAppearancesInExam", maxAppearances);
        inputs.put("curatedWeightagePercent", curatedWeightage == null ? null : curatedWeightage.toPlainString());
        inputs.put("computedWeightagePercent", computedWeightage == null ? null : computedWeightage.toPlainString());
        inputs.put("trendDirection", trend.direction.name());
        inputs.put("trendNormalised", trend.normalised.toPlainString());
        inputs.put("questionCount", questionCount);
        inputs.put("coverage", coverage.toPlainString());
        inputs.put("weights", Map.of(
                "weightage", W_WEIGHTAGE.toPlainString(),
                "trend", W_TREND.toPlainString(),
                "coverage", W_COVERAGE.toPlainString()));
        result.inputs = inputs;
        return result;
    }

    /* ------------------------------------------------------------------- Overrides */

    /**
     * Sets or clears an admin priority override (TICKET-2107).
     *
     * <p>Never touches {@code systemPriority}. Passing a null priority clears the override
     * and hands the ranking back to the computed value, which is why the override column is
     * nullable rather than defaulted.
     */
    public TopicIntelligenceDtos.TopicIntelligence setOverride(String examCode,
                                                               UUID topicId,
                                                               TopicIntelligenceDtos.OverrideRequest request,
                                                               User admin) {
        requireExam(examCode);
        TopicPriority row = priorities.findOne(examCode, topicId, ALGORITHM_VERSION)
                .orElseThrow(() -> new NoSuchElementException(
                        "No computed priority for topic " + topicId + " on " + examCode
                                + " — recompute the exam's topic intelligence first."));

        BigDecimal priority = request.getPriority();
        if (priority == null) {
            row.setAdminOverride(null);
            row.setOverrideReason(null);
            row.setOverrideBy(null);
            row.setOverrideAt(null);
        } else {
            String reason = request.getReason() == null ? "" : request.getReason().trim();
            if (reason.isEmpty()) {
                throw new IllegalArgumentException(
                        "An override needs a reason — it is what makes the decision auditable later.");
            }
            row.setAdminOverride(priority);
            row.setOverrideReason(reason);
            row.setOverrideBy(admin.getId());
            row.setOverrideAt(OffsetDateTime.now());
        }
        row.recomputeFinalPriority();

        Optional<TopicTrend> trend = trends.findById(
                TopicTrend.idFor(examCode, topicId, ALGORITHM_VERSION));
        ExamTopic mapping = examTopics
                .findById(ExamTopic.idFor(examCode, topicId))
                .orElse(null);
        return toDto(row.getTopic(), mapping, trend.orElse(null), row);
    }

    /* ------------------------------------------------------------------------ Read */

    /**
     * Everything computed for one exam, ranked by final priority.
     *
     * <p>Built from the {@code exam_topics} mapping outward rather than from the trend or
     * priority tables, so a topic that is mapped but has never been scored still appears —
     * with nulls that say "not computed yet" instead of being silently absent.
     */
    @Transactional(readOnly = true)
    public TopicIntelligenceDtos.ExamTopicIntelligenceResponse getForExam(String examCode) {
        requireExam(examCode);

        List<ExamTopic> mapped = examTopics.findByExamCodeOrderByTopicName(examCode);

        Map<UUID, TopicTrend> trendByTopic = new HashMap<>();
        for (TopicTrend t : trends.findForExamAndVersion(examCode, ALGORITHM_VERSION)) {
            trendByTopic.put(t.getTopic().getId(), t);
        }
        Map<UUID, TopicPriority> priorityByTopic = new HashMap<>();
        for (TopicPriority p : priorities.findForExamAndVersion(examCode, ALGORITHM_VERSION)) {
            priorityByTopic.put(p.getTopic().getId(), p);
        }

        List<TopicIntelligenceDtos.TopicIntelligence> rows = new ArrayList<>();
        for (ExamTopic mapping : mapped) {
            Topic topic = mapping.getTopic();
            rows.add(toDto(topic, mapping, trendByTopic.get(topic.getId()), priorityByTopic.get(topic.getId())));
        }

        // Highest final priority first, nulls last, then alphabetical so the order is stable
        // between calls even when scores tie.
        rows.sort(Comparator
                .comparing(TopicIntelligenceDtos.TopicIntelligence::finalPriority,
                        Comparator.nullsLast(Comparator.reverseOrder()))
                .thenComparing(TopicIntelligenceDtos.TopicIntelligence::topicName));

        long pyqTagged = trendByTopic.values().stream()
                .mapToLong(TopicTrend::getAppearanceCount)
                .sum();

        return new TopicIntelligenceDtos.ExamTopicIntelligenceResponse(
                examCode, ALGORITHM_VERSION, pyqTagged, rows);
    }

    private static TopicIntelligenceDtos.TopicIntelligence toDto(Topic topic,
                                                                 ExamTopic mapping,
                                                                 TopicTrend trend,
                                                                 TopicPriority priority) {
        Topic parent = topic.getParent();
        return new TopicIntelligenceDtos.TopicIntelligence(
                topic.getId(),
                topic.getName(),
                topic.getSubject().getId(),
                topic.getSubject().getName(),
                parent != null ? parent.getId() : null,
                parent != null ? parent.getName() : null,
                mapping != null ? mapping.getWeightagePercent() : null,
                trend != null ? trend.getComputedWeightagePercent() : null,
                trend != null ? trend.getAppearanceCount() : 0,
                trend != null ? trend.getWindowFromYear() : null,
                trend != null ? trend.getWindowToYear() : null,
                trend != null ? trend.getTrendDirection().name() : TopicTrend.Direction.INSUFFICIENT_DATA.name(),
                trend != null ? trend.getTrendScore() : null,
                priority != null ? priority.getSystemPriority() : null,
                priority != null ? priority.getAdminOverride() : null,
                priority != null ? priority.getFinalPriority() : null,
                priority != null ? priority.getOverrideReason() : null,
                priority != null ? priority.getOverrideAt() : null,
                ALGORITHM_VERSION,
                priority != null ? priority.getInputs() : null,
                priority != null ? priority.getComputedAt() : null
        );
    }

    /* ----------------------------------------------------------------------- Utils */

    /** topicId -> (year -> appearances), from one grouped query. */
    private Map<UUID, Map<Integer, Long>> pyqHistogram(String examCode) {
        Map<UUID, Map<Integer, Long>> byTopic = new HashMap<>();
        for (Object[] row : questions.aggregatePyqByTopicAndYear(examCode)) {
            UUID topicId = (UUID) row[0];
            Integer year = ((Number) row[1]).intValue();
            long count = ((Number) row[2]).longValue();
            byTopic.computeIfAbsent(topicId, k -> new HashMap<>()).merge(year, count, Long::sum);
        }
        return byTopic;
    }

    private Map<UUID, Long> questionCountsByTopic(String examCode) {
        Map<UUID, Long> counts = new HashMap<>();
        for (Object[] row : questions.countByTopicForExam(examCode)) {
            counts.put((UUID) row[0], ((Number) row[1]).longValue());
        }
        return counts;
    }

    private Exam requireExam(String examCode) {
        return exams.findById(examCode)
                .orElseThrow(() -> new NoSuchElementException("Exam not found: " + examCode));
    }
}
