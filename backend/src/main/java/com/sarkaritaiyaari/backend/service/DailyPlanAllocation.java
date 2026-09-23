package com.sarkaritaiyaari.backend.service;

import java.util.EnumMap;
import java.util.Map;

/**
 * How one day's minutes are divided between the five kinds of task, and how many new topics a day
 * may open (TASK-3501).
 *
 * <h2>Why this is its own class</h2>
 * Every rule here is arithmetic over declared constants — no repository, no entity, no clock. That
 * makes it testable as a decision table with constructed inputs rather than against whatever the
 * shared database happens to hold, which is the precedent {@code TaskOutcomeRuleTest},
 * {@code RevisionLadderTest} and {@code WorkloadEstimatorTest} already set. Phase 6 passed its first
 * real run because its rules went through a plain-JUnit test before any integration test ran; these
 * follow it deliberately.
 *
 * <h2>What it does NOT decide</h2>
 * Nothing here estimates how long a question takes — that is {@link WorkloadEstimator}'s job and
 * stays there. This class only answers "how many minutes may this category spend" and "given a
 * seconds-per-question figure somebody else measured, how many questions fit in them".
 */
public final class DailyPlanAllocation {

    private DailyPlanAllocation() {
    }

    /** The five learning purposes a day is built from. */
    public enum Category {
        /** Work already done and now fading — {@code RevisionPlanService}'s due list. */
        REVISION,
        /** Topics the student is currently struggling with. */
        WEAK_TOPIC,
        /** Ground not yet covered. */
        NEW_TOPIC,
        /** Already encountered, not yet strong — retrieval practice. */
        STRENGTHEN,
        /** Specific questions previously answered wrongly. */
        MISTAKE_REVIEW
    }

    /**
     * The reference day the shares below are expressed against, and the one the product spec states
     * directly: 25 / 20 / 20 / 15 / 10 for a 90-minute student. Any other budget scales from it, so
     * there is exactly one place to change the balance.
     */
    public static final int REFERENCE_MINUTES = 90;

    private static final Map<Category, Integer> REFERENCE_SHARE = new EnumMap<>(Map.of(
            Category.NEW_TOPIC, 25,
            Category.REVISION, 20,
            Category.WEAK_TOPIC, 20,
            Category.STRENGTHEN, 15,
            Category.MISTAKE_REVIEW, 10));

    /**
     * The order categories are filled in, which is also the order leftover rounding minutes are
     * handed back in. Revision leads because a topic already learned and now fading is cheaper to
     * recover than a new one is to build; mistake review is last because it is the smallest slice
     * and the least urgent if the day runs out.
     */
    private static final Category[] SPEND_ORDER = {
            Category.REVISION,
            Category.WEAK_TOPIC,
            Category.NEW_TOPIC,
            Category.STRENGTHEN,
            Category.MISTAKE_REVIEW
    };

    /**
     * At or below this many minutes a day opens at most one new topic. Two thresholds rather than a
     * per-band table because the student never states minutes — onboarding asks for a band, and the
     * planner resolves it (see {@code DailyPlanService.BUDGETS}), so a ladder over minutes is the
     * only form that also covers the 60-minute {@code DEFAULT} and any band added later.
     *
     * <p>These two numbers reproduce the specified table exactly: 30 → 1, 45 → 1, 60 → 2, 90 → 2,
     * 120 → 2, 180 and above → 3.
     */
    public static final int ONE_NEW_TOPIC_UP_TO_MINUTES = 45;

    public static final int TWO_NEW_TOPICS_UP_TO_MINUTES = 120;

    /** Maximums, never targets: a day with fewer eligible topics assigns fewer. */
    public static final int MAX_NEW_TOPICS_SHORT_DAY = 1;

    public static final int MAX_NEW_TOPICS_NORMAL_DAY = 2;

    public static final int MAX_NEW_TOPICS_LONG_DAY = 3;

    /** Fill order, for a caller that wants to iterate categories the way a day is built. */
    public static Category[] spendOrder() {
        return SPEND_ORDER.clone();
    }

    /**
     * Target minutes per category for a given budget, summing to exactly {@code budgetMinutes}.
     *
     * <p>These are targets, not guarantees. A category with nothing eligible spends none of its
     * share, and the unspent remainder is available to whatever is filled after it — but no category
     * may exceed its own share, which is what stops one purpose eating the whole day.
     *
     * <p>Flooring each share loses up to four minutes, so the remainder is handed back in
     * {@link #SPEND_ORDER}. Without that a 45-minute day would silently budget 44.
     */
    public static Map<Category, Integer> allocate(int budgetMinutes) {
        Map<Category, Integer> out = new EnumMap<>(Category.class);
        if (budgetMinutes <= 0) {
            for (Category category : Category.values()) out.put(category, 0);
            return out;
        }

        int assigned = 0;
        for (Category category : Category.values()) {
            int share = (int) ((long) budgetMinutes * REFERENCE_SHARE.get(category) / REFERENCE_MINUTES);
            out.put(category, share);
            assigned += share;
        }

        // Strictly fewer than five, since each floor loses under a minute — so this terminates.
        int leftover = budgetMinutes - assigned;
        for (int i = 0; leftover > 0; i = (i + 1) % SPEND_ORDER.length) {
            out.merge(SPEND_ORDER[i], 1, Integer::sum);
            leftover--;
        }
        return out;
    }

    /**
     * How many new topics this budget may open.
     *
     * <p>The point of this existing at all: the count must NOT emerge only from dividing the budget
     * by an estimated question duration. A fast solver on a long day would otherwise be handed six
     * unfamiliar topics in one sitting, which is a worse day than two done properly — a judgement
     * about learning, not about arithmetic, and therefore stated rather than derived.
     */
    public static int maxNewTopics(int budgetMinutes) {
        if (budgetMinutes <= ONE_NEW_TOPIC_UP_TO_MINUTES) return MAX_NEW_TOPICS_SHORT_DAY;
        if (budgetMinutes <= TWO_NEW_TOPICS_UP_TO_MINUTES) return MAX_NEW_TOPICS_NORMAL_DAY;
        return MAX_NEW_TOPICS_LONG_DAY;
    }

    /**
     * How many of a recommended question set fit in an allowance, given somebody else's measured
     * seconds-per-question.
     *
     * <p>This is the "select fewer questions rather than exceeding the budget" rule. It never
     * rounds up and never returns more than was recommended, so the radar's own 10/15 figures stay
     * the ceiling and the allowance stays the floor. Zero means not even one question fits, and the
     * caller should assign nothing rather than overshoot.
     *
     * <p>Consistent with {@link WorkloadEstimator#minutes} by construction: that rounds a set's
     * duration UP to whole minutes, and a count returned here always has a whole-minute duration at
     * or below {@code allowanceMinutes}.
     */
    public static int questionsThatFit(int recommendedCount, int allowanceMinutes,
                                       int secondsPerQuestion) {
        if (recommendedCount <= 0 || allowanceMinutes <= 0 || secondsPerQuestion <= 0) return 0;
        long fits = (long) allowanceMinutes * 60 / secondsPerQuestion;
        return (int) Math.min(recommendedCount, Math.max(0, fits));
    }
}
