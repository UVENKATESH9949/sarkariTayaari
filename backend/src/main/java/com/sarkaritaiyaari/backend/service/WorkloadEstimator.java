package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.StudyRoadmapDtos.WorkloadEstimate;
import com.sarkaritaiyaari.backend.repository.WorkloadTimingRepository;
import org.springframework.stereotype.Component;

import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;

/**
 * How long one question takes, and on what basis. Shared by every phase that needs to turn a
 * question count into minutes — Phase 4's roadmap ({@link StudyRoadmapService}) and Phase 7's
 * revision plan ({@link RevisionPlanService}) — so the two cannot drift into different ideas of
 * what an hour of study contains.
 *
 * <h2>The ladder (TASK-3101 D4.2)</h2>
 * <pre>
 * PERSONAL_TOPIC      this student's measured average for this topic    (>= 5 timed attempts)
 * COHORT_TOPIC        every student's measured average for this topic   (>= 20 timed attempts)
 * COHORT_DIFFICULTY   every student's average at this difficulty level  (>= 20 timed attempts)
 * DEFAULT             a stated constant, declared as an assumption
 * </pre>
 *
 * Each tier is a weaker claim than the one above it, so {@link WorkloadEstimate#source()} travels
 * with the number. A measured average and a stated constant are different claims and must never be
 * presented in the same shape.
 *
 * <h2>Why resolution is static and the loading is not</h2>
 * {@link #resolve} is pure: given timings, it picks a tier. That is the part with rules worth
 * asserting, and it is unit-tested with constructed samples rather than against whatever the shared
 * database happens to contain — which is how the first version of this was tested, and it failed,
 * because the dev database turned out to hold real cohort rows where the test assumed none.
 */
@Component
public class WorkloadEstimator {

    /**
     * Timed attempts required before an average is trusted. Both are judgements, named here rather
     * than buried in an expression: below them an average is noise, and noise presented as a
     * measurement is worse than a declared default.
     *
     * <p>The personal floor is lower on purpose — five of a student's own attempts say more about
     * how long <i>they</i> take than twenty of everyone else's.
     */
    public static final int MIN_PERSONAL_SAMPLE = 5;

    public static final int MIN_COHORT_SAMPLE = 20;

    /**
     * The last resort, used only when nothing has been measured for a topic or its difficulty.
     * A stated assumption, not a measurement — which is why it is labelled {@code DEFAULT}
     * wherever it lands.
     */
    public static final int DEFAULT_SECONDS_PER_QUESTION = 75;

    /**
     * The same 365-day window {@code UserAnalyticsService} uses. Deliberately identical: a
     * "measured average" that meant one window here and another there would be two different
     * claims wearing the same word.
     */
    public static final int LIFETIME_DAYS = 365;

    private final WorkloadTimingRepository timings;

    public WorkloadEstimator(WorkloadTimingRepository timings) {
        this.timings = timings;
    }

    /** An average and the number of timed attempts it was computed from. */
    public record Sample(int seconds, long count) {
    }

    /** Everything {@link #resolve} needs, loaded once per request. */
    public record Timing(Map<UUID, Sample> personalByTopic,
                         Map<UUID, Sample> cohortByTopic,
                         Map<String, Sample> cohortByDifficulty) {

        /** For unit tests and for a caller with nothing measured. */
        public static Timing empty() {
            return new Timing(Map.of(), Map.of(), Map.of());
        }
    }

    public Timing load(UUID userId, OffsetDateTime now) {
        OffsetDateTime since = now.minusDays(LIFETIME_DAYS);
        return new Timing(
                mergeUuidKeyed(timings.personalPracticeByTopic(userId, since),
                        timings.personalMockByTopic(userId, since)),
                mergeUuidKeyed(timings.cohortPracticeByTopic(since),
                        timings.cohortMockByTopic(since)),
                mergeStringKeyed(timings.cohortPracticeByDifficulty(since),
                        timings.cohortMockByDifficulty(since)));
    }

    /**
     * Walk the ladder for one topic. {@code difficultyCode} is the difficulty its recommended work
     * draws from, or null when it names none — the difficulty tier is simply skipped then.
     */
    public static WorkloadEstimate resolve(UUID topicId, String difficultyCode, Timing timing) {
        Sample personal = timing.personalByTopic().get(topicId);
        if (personal != null && personal.count() >= MIN_PERSONAL_SAMPLE) {
            return new WorkloadEstimate("PERSONAL_TOPIC", personal.seconds(), personal.count());
        }

        Sample cohortTopic = timing.cohortByTopic().get(topicId);
        if (cohortTopic != null && cohortTopic.count() >= MIN_COHORT_SAMPLE) {
            return new WorkloadEstimate("COHORT_TOPIC", cohortTopic.seconds(), cohortTopic.count());
        }

        if (difficultyCode != null) {
            Sample byDifficulty = timing.cohortByDifficulty().get(difficultyCode);
            if (byDifficulty != null && byDifficulty.count() >= MIN_COHORT_SAMPLE) {
                return new WorkloadEstimate("COHORT_DIFFICULTY", byDifficulty.seconds(),
                        byDifficulty.count());
            }
        }

        return new WorkloadEstimate("DEFAULT", DEFAULT_SECONDS_PER_QUESTION, 0);
    }

    /** Minutes for a question set, rounded up: a plan that under-books its own time is worse. */
    public static int minutes(int questionCount, WorkloadEstimate estimate) {
        long seconds = (long) questionCount * estimate.secondsPerQuestion();
        return (int) Math.max(1, (seconds + 59) / 60);
    }

    /* =============================================================================== merging */

    /**
     * Practice and mock are pooled into one average, matching what {@code averageTimeMs} already
     * reports. Pooling re-derives each side's total from its own average and count — averaging two
     * averages would weight a handful of mock answers as heavily as hundreds of practice ones.
     */
    private static Map<UUID, Sample> mergeUuidKeyed(List<Object[]> practice, List<Object[]> mock) {
        Map<UUID, long[]> totals = new HashMap<>();
        accumulate(totals, practice, row -> (UUID) row[0]);
        accumulate(totals, mock, row -> (UUID) row[0]);
        return toSamples(totals);
    }

    private static Map<String, Sample> mergeStringKeyed(List<Object[]> practice, List<Object[]> mock) {
        Map<String, long[]> totals = new HashMap<>();
        accumulate(totals, practice, row -> (String) row[0]);
        accumulate(totals, mock, row -> (String) row[0]);
        return toSamples(totals);
    }

    private static <K> void accumulate(Map<K, long[]> totals, List<Object[]> rows,
                                       Function<Object[], K> key) {
        for (Object[] row : rows) {
            K k = key.apply(row);
            if (k == null || row[1] == null || row[2] == null) continue;
            double average = ((Number) row[1]).doubleValue();
            long count = ((Number) row[2]).longValue();
            if (count <= 0) continue;
            long[] slot = totals.computeIfAbsent(k, ignored -> new long[2]);
            slot[0] += Math.round(average * count);
            slot[1] += count;
        }
    }

    private static <K> Map<K, Sample> toSamples(Map<K, long[]> totals) {
        Map<K, Sample> out = new HashMap<>();
        for (Map.Entry<K, long[]> e : totals.entrySet()) {
            long[] slot = e.getValue();
            if (slot[1] <= 0) continue;
            int seconds = (int) Math.max(1, Math.round(slot[0] / (double) slot[1] / 1000.0));
            out.put(e.getKey(), new Sample(seconds, slot[1]));
        }
        return out;
    }
}
