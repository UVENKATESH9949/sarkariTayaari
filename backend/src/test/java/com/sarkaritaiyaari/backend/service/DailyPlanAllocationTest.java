package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.service.DailyPlanAllocation.Category;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The daily allocation rules (TASK-3501) as a plain unit test — no Spring, no database, matching
 * {@code TaskOutcomeRuleTest} / {@code RevisionLadderTest} / {@code WorkloadEstimatorTest}.
 *
 * <p>This is the class that has to be right before any integration test is worth running: every
 * number here is a declared judgement about how a day is divided, and asserting them against
 * constructed inputs is the only way to check the arithmetic without a database's contents deciding
 * the answer. Phase 6 passed its first real run because its rules went through a test like this one
 * first; Phase 4's tier test failed because they did not.
 *
 * <p>Worth stating once: these tests assert the rules behave <i>as decided</i>. None of them asserts
 * the split is the <i>right</i> split, and none could — 25/20/20/15/10 is a product judgement.
 */
class DailyPlanAllocationTest {

    /* -------------------------------------------------------------- the new-topic maximum ladder */

    /**
     * The specified table, verbatim. The student never states minutes — a band is resolved to them
     * first — so this is keyed on the resolved budget, which is also what makes the 60-minute
     * DEFAULT land somewhere defined.
     */
    @Test
    void theNewTopicMaximumFollowsTheStatedTimeBands() {
        assertThat(DailyPlanAllocation.maxNewTopics(30)).isEqualTo(1);
        assertThat(DailyPlanAllocation.maxNewTopics(45)).isEqualTo(1);
        assertThat(DailyPlanAllocation.maxNewTopics(60)).isEqualTo(2);
        assertThat(DailyPlanAllocation.maxNewTopics(90)).isEqualTo(2);
        assertThat(DailyPlanAllocation.maxNewTopics(120)).isEqualTo(2);
        assertThat(DailyPlanAllocation.maxNewTopics(180)).isEqualTo(3);
    }

    /** Every band this app can actually produce, including the default, lands on a real maximum. */
    @Test
    void everyRealBandResolvesToAMaximum() {
        assertThat(DailyPlanAllocation.maxNewTopics(45)).isEqualTo(1);   // UNDER_1H
        assertThat(DailyPlanAllocation.maxNewTopics(DailyPlanService.DEFAULT_BUDGET_MINUTES))
                .isEqualTo(2);                                           // no profile
        assertThat(DailyPlanAllocation.maxNewTopics(90)).isEqualTo(2);   // ONE_TO_TWO
        assertThat(DailyPlanAllocation.maxNewTopics(180)).isEqualTo(3);  // TWO_TO_FOUR
        assertThat(DailyPlanAllocation.maxNewTopics(300)).isEqualTo(3);  // FOUR_TO_SIX
        assertThat(DailyPlanAllocation.maxNewTopics(360)).isEqualTo(3);  // SIX_PLUS
    }

    /**
     * A very long day does not keep opening new topics. This is the whole point of the cap existing
     * separately from the time budget: six unfamiliar topics in one sitting is a worse day than
     * three done properly, which is a judgement about learning rather than about arithmetic.
     */
    @Test
    void anEnormousBudgetStillOpensAtMostThreeNewTopics() {
        assertThat(DailyPlanAllocation.maxNewTopics(600)).isEqualTo(3);
        assertThat(DailyPlanAllocation.maxNewTopics(10_000)).isEqualTo(3);
    }

    /* ----------------------------------------------------------------------- the minute split */

    /** The stated reference allocation, exactly. */
    @Test
    void aNinetyMinuteDayIsSplitAsSpecified() {
        Map<Category, Integer> allocation = DailyPlanAllocation.allocate(90);

        assertThat(allocation.get(Category.NEW_TOPIC)).isEqualTo(25);
        assertThat(allocation.get(Category.REVISION)).isEqualTo(20);
        assertThat(allocation.get(Category.WEAK_TOPIC)).isEqualTo(20);
        assertThat(allocation.get(Category.STRENGTHEN)).isEqualTo(15);
        assertThat(allocation.get(Category.MISTAKE_REVIEW)).isEqualTo(10);
    }

    /**
     * Whatever the budget, the shares add up to exactly it — never more (which would overbook the
     * day before a single task was chosen) and never less (which would silently lose minutes to
     * rounding, as flooring five shares does).
     */
    @Test
    void theSharesAlwaysSumToTheBudget() {
        for (int minutes : new int[] { 1, 7, 30, 45, 60, 90, 120, 180, 300, 360, 599 }) {
            assertThat(sum(DailyPlanAllocation.allocate(minutes)))
                    .as("budget of %d minutes", minutes)
                    .isEqualTo(minutes);
        }
    }

    /** Every category gets a real share on any ordinary day — no purpose is quietly zeroed out. */
    @Test
    void everyPurposeGetsTimeOnAnOrdinaryDay() {
        for (int minutes : new int[] { 45, 60, 90, 180, 300, 360 }) {
            Map<Category, Integer> allocation = DailyPlanAllocation.allocate(minutes);
            for (Category category : Category.values()) {
                assertThat(allocation.get(category))
                        .as("%s on a %d-minute day", category, minutes)
                        .isPositive();
            }
        }
    }

    /** No category may exceed its own share, so no single purpose can take the whole day. */
    @Test
    void noSinglePurposeCanTakeTheWholeDay() {
        Map<Category, Integer> allocation = DailyPlanAllocation.allocate(90);
        for (Category category : Category.values()) {
            assertThat(allocation.get(category)).isLessThan(90);
        }
        // Revision specifically: this used to be capped at half the day by a constant of its own,
        // which the allocation now supersedes. It must be well under that.
        assertThat(allocation.get(Category.REVISION)).isLessThan(45);
    }

    @Test
    void aZeroOrNegativeBudgetAllocatesNothingRatherThanFailing() {
        assertThat(sum(DailyPlanAllocation.allocate(0))).isZero();
        assertThat(sum(DailyPlanAllocation.allocate(-5))).isZero();
    }

    /* --------------------------------------------------------------------- fitting question sets */

    /**
     * The "select fewer questions rather than exceed the budget" rule. The recommendation is the
     * ceiling and the allowance is the floor; nothing here invents a count from the time alone.
     */
    @Test
    void aRecommendationThatFitsIsUsedWhole() {
        // 10 questions at 60s = 10 minutes, inside a 20-minute allowance.
        assertThat(DailyPlanAllocation.questionsThatFit(10, 20, 60)).isEqualTo(10);
        // Exactly on the line still fits.
        assertThat(DailyPlanAllocation.questionsThatFit(10, 10, 60)).isEqualTo(10);
    }

    @Test
    void aRecommendationThatDoesNotFitIsTrimmedRatherThanDropped() {
        // 15 questions at 75s would be 19 minutes; a 10-minute allowance holds 8.
        assertThat(DailyPlanAllocation.questionsThatFit(15, 10, 75)).isEqualTo(8);
        // A slow measured pace trims harder — same allowance, fewer questions. This is the whole
        // reason question count is not a fixed number per time band.
        assertThat(DailyPlanAllocation.questionsThatFit(15, 10, 150)).isEqualTo(4);
        // ...and a fast one trims less, or not at all.
        assertThat(DailyPlanAllocation.questionsThatFit(15, 10, 30)).isEqualTo(15);
    }

    /**
     * Zero means "not even one question fits", which the caller turns into "assign nothing" rather
     * than overshooting the day.
     */
    @Test
    void anAllowanceTooSmallForOneQuestionFitsNothing() {
        assertThat(DailyPlanAllocation.questionsThatFit(10, 1, 150)).isZero();
        assertThat(DailyPlanAllocation.questionsThatFit(10, 0, 75)).isZero();
        assertThat(DailyPlanAllocation.questionsThatFit(0, 20, 75)).isZero();
        // A negative allowance is what an already-overspent category reports; it must not wrap.
        assertThat(DailyPlanAllocation.questionsThatFit(10, -4, 75)).isZero();
    }

    /**
     * The contract with {@link WorkloadEstimator#minutes}, which rounds a set's duration UP: a count
     * this returns must never cost more than the allowance it was measured against, or a day could
     * exceed its budget one rounding at a time.
     */
    @Test
    void aFittedCountNeverCostsMoreThanItsAllowance() {
        for (int seconds : new int[] { 17, 30, 45, 61, 75, 90, 150 }) {
            for (int allowance = 1; allowance <= 40; allowance++) {
                int count = DailyPlanAllocation.questionsThatFit(50, allowance, seconds);
                if (count == 0) continue;
                int minutes = WorkloadEstimator.minutes(count,
                        new com.sarkaritaiyaari.backend.dto.StudyRoadmapDtos.WorkloadEstimate(
                                "DEFAULT", seconds, 0));
                assertThat(minutes)
                        .as("%d questions at %ds inside %d minutes", count, seconds, allowance)
                        .isLessThanOrEqualTo(allowance);
            }
        }
    }

    private static int sum(Map<Category, Integer> allocation) {
        int total = 0;
        for (Category category : Category.values()) total += allocation.get(category);
        return total;
    }
}
