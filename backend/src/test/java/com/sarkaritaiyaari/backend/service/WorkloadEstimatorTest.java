package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.StudyRoadmapDtos.WorkloadEstimate;
import com.sarkaritaiyaari.backend.service.WorkloadEstimator.Sample;
import com.sarkaritaiyaari.backend.service.WorkloadEstimator.Timing;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The estimate ladder (TASK-3101 D4.2), asserted as a plain unit test — no Spring, no database,
 * matching the {@link TopicHealthScoringTest} precedent for a service whose rules are arithmetic.
 *
 * <h2>Why this exists rather than an integration test</h2>
 * The first version of this phase asserted the tiers end to end and one of those tests failed: it
 * expected {@code DEFAULT} for a fresh topic, and got {@code COHORT_DIFFICULTY} — because the
 * shared dev database genuinely holds 53 timed attempts at the easiest difficulty, so the ladder
 * correctly found a real tier. The test's premise was wrong, not the code.
 *
 * <p>The lesson generalises: a tier-selection rule cannot be asserted against a database whose
 * contents are not controlled by the test. Here the samples are constructed, so every branch —
 * including the ones the real database can no longer reach — is genuinely exercised.
 */
class WorkloadEstimatorTest {

    private static final UUID TOPIC = UUID.randomUUID();
    private static final UUID OTHER_TOPIC = UUID.randomUUID();

    @Test
    void personalMeasurementWinsWhenItClearsItsFloor() {
        Timing timing = new Timing(
                Map.of(TOPIC, new Sample(94, WorkloadEstimator.MIN_PERSONAL_SAMPLE)),
                Map.of(TOPIC, new Sample(60, 500)),
                Map.of("easy", new Sample(30, 500)));

        WorkloadEstimate estimate = WorkloadEstimator.resolve(TOPIC, "easy", timing);

        // Five of the student's own attempts beat five hundred of everyone else's: the question is
        // how long THIS student takes.
        assertThat(estimate.source()).isEqualTo("PERSONAL_TOPIC");
        assertThat(estimate.secondsPerQuestion()).isEqualTo(94);
        assertThat(estimate.sampleSize()).isEqualTo(WorkloadEstimator.MIN_PERSONAL_SAMPLE);
    }

    @Test
    void oneAttemptShortOfTheFloorIsNotTrusted() {
        Timing timing = new Timing(
                Map.of(TOPIC, new Sample(94, WorkloadEstimator.MIN_PERSONAL_SAMPLE - 1)),
                Map.of(TOPIC, new Sample(60, WorkloadEstimator.MIN_COHORT_SAMPLE)),
                Map.of());

        WorkloadEstimate estimate = WorkloadEstimator.resolve(TOPIC, "easy", timing);

        // The floors are the whole point: below them an average is noise, and noise presented as a
        // measurement is worse than a declared default.
        assertThat(estimate.source()).isEqualTo("COHORT_TOPIC");
        assertThat(estimate.secondsPerQuestion()).isEqualTo(60);
    }

    @Test
    void theDifficultyTierCatchesATopicNobodyHasEverPractised() {
        Timing timing = new Timing(
                Map.of(),
                Map.of(OTHER_TOPIC, new Sample(60, 900)),
                Map.of("hard", new Sample(140, WorkloadEstimator.MIN_COHORT_SAMPLE)));

        WorkloadEstimate estimate = WorkloadEstimator.resolve(TOPIC, "hard", timing);

        // This is what keeps "harder questions take longer" alive without hardcoding a difficulty
        // code — the key is whatever difficulty_levels actually holds.
        assertThat(estimate.source()).isEqualTo("COHORT_DIFFICULTY");
        assertThat(estimate.secondsPerQuestion()).isEqualTo(140);
    }

    @Test
    void withNothingMeasuredAnywhereTheEstimateIsADeclaredDefault() {
        WorkloadEstimate estimate = WorkloadEstimator.resolve(TOPIC, "easy", Timing.empty());

        assertThat(estimate.source()).isEqualTo("DEFAULT");
        assertThat(estimate.secondsPerQuestion())
                .isEqualTo(WorkloadEstimator.DEFAULT_SECONDS_PER_QUESTION);
        // Zero is the tell: there is no evidence behind this number, and the payload says so.
        assertThat(estimate.sampleSize()).isZero();
    }

    @Test
    void aStepThatNamesNoDifficultySkipsThatTierRatherThanGuessing() {
        Timing timing = new Timing(Map.of(), Map.of(),
                Map.of("easy", new Sample(30, 900)));

        WorkloadEstimate estimate = WorkloadEstimator.resolve(TOPIC, null, timing);

        // There is cohort data, but not for a difficulty this step claims — picking one anyway
        // would be inventing which difficulty the student is about to practise.
        assertThat(estimate.source()).isEqualTo("DEFAULT");
    }

    @Test
    void minutesRoundUpAndNeverReachZero() {
        WorkloadEstimate ninetySeconds = new WorkloadEstimate("PERSONAL_TOPIC", 90, 10);

        assertThat(WorkloadEstimator.minutes(10, ninetySeconds)).isEqualTo(15);
        // 4 × 90s = 6 minutes exactly — no spurious rounding up when it already divides.
        assertThat(WorkloadEstimator.minutes(4, ninetySeconds)).isEqualTo(6);
        // 1 × 90s = 1.5 minutes, rounded up: a plan that under-books its own time is worse than
        // one that over-books it.
        assertThat(WorkloadEstimator.minutes(1, ninetySeconds)).isEqualTo(2);
        // A one-question step at a fast rate still costs something, never zero.
        assertThat(WorkloadEstimator.minutes(1, new WorkloadEstimate("COHORT_TOPIC", 5, 40)))
                .isEqualTo(1);
    }
}
