package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.entity.StudyTask;
import com.sarkaritaiyaari.backend.service.TaskOutcomeService.Observed;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The outcome rule (TASK-3401 D6.1) as a plain unit test — no Spring, no database, matching the
 * precedent set by {@code RevisionLadderTest} and {@code WorkloadEstimatorTest} for logic that is a
 * decision table rather than plumbing.
 *
 * <p>Worth stating once: {@code COMPLETION_THRESHOLD} is a declared judgement about where "did it"
 * ends and "started it" begins. These tests assert the rule behaves as decided; none of them
 * asserts the threshold is the right one, and none could.
 */
class TaskOutcomeRuleTest {

    @Test
    void noActivityAtAllIsSkipped() {
        assertThat(TaskOutcomeService.outcomeFor(task(15), new Observed(0, 0)))
                .isEqualTo(TaskOutcomeService.SKIPPED);
    }

    @Test
    void enoughOfTheAskedQuestionsCountsAsDone() {
        // 15 planned, threshold 0.6 -> 9 answers is the line.
        assertThat(TaskOutcomeService.outcomeFor(task(15), new Observed(9, 5)))
                .isEqualTo(TaskOutcomeService.COMPLETED);
        assertThat(TaskOutcomeService.outcomeFor(task(15), new Observed(15, 15)))
                .isEqualTo(TaskOutcomeService.COMPLETED);
        // More than asked is still done, not something else — a student who kept going has not
        // failed the task.
        assertThat(TaskOutcomeService.outcomeFor(task(15), new Observed(40, 20)))
                .isEqualTo(TaskOutcomeService.COMPLETED);
    }

    @Test
    void realButInsufficientWorkIsPartialRatherThanSkipped() {
        assertThat(TaskOutcomeService.outcomeFor(task(15), new Observed(8, 4)))
                .isEqualTo(TaskOutcomeService.PARTIAL);
        // A single answer is still evidence they turned up. Calling that "skipped" would be false,
        // and is the distinction Phase 6 exists to record.
        assertThat(TaskOutcomeService.outcomeFor(task(15), new Observed(1, 0)))
                .isEqualTo(TaskOutcomeService.PARTIAL);
    }

    @Test
    void outcomeIsIndependentOfWhetherTheAnswersWereCorrect() {
        // Doing the work and doing it well are different questions; the health model owns the
        // second one. A task answered entirely wrongly was still done.
        assertThat(TaskOutcomeService.outcomeFor(task(10), new Observed(10, 0)))
                .isEqualTo(TaskOutcomeService.COMPLETED);
    }

    @Test
    void aTaskWithNoPlannedCountCountsAsDoneOnAnyActivity() {
        // Phase 5 does not currently emit one, but the shape allows it — and with no target to
        // measure against, any real work is the most that can be claimed.
        assertThat(TaskOutcomeService.outcomeFor(task(null), new Observed(1, 1)))
                .isEqualTo(TaskOutcomeService.COMPLETED);
        assertThat(TaskOutcomeService.outcomeFor(task(null), new Observed(0, 0)))
                .isEqualTo(TaskOutcomeService.SKIPPED);
    }

    @Test
    void accuracyIsNullWhenNothingWasAnswered() {
        // Never zero: zero would claim a measured 0%, which is a different thing from "we have
        // nothing to measure" — the same null rule the rest of this program applies.
        assertThat(new Observed(0, 0).accuracyPercent()).isNull();
        assertThat(new Observed(4, 1).accuracyPercent()).isEqualTo(25);
    }

    private static StudyTask task(Integer plannedQuestionCount) {
        StudyTask task = new StudyTask();
        task.setPlannedQuestionCount(plannedQuestionCount);
        return task;
    }
}
