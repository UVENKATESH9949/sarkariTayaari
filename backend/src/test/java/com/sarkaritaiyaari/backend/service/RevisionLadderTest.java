package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.LearningStateDtos.TopicLearningState;
import com.sarkaritaiyaari.backend.service.RevisionPlanService.Rung;
import org.junit.jupiter.api.Test;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The spaced-repetition ladder (TASK-3201 D7.1) as a plain unit test — no Spring, no database,
 * matching the {@link TopicHealthScoringTest} precedent for a service whose rules are a decision
 * table rather than plumbing.
 *
 * <p>Worth stating once here, because it is the thing most likely to be misread later: the
 * <b>3 / 7 / 21 / 45-day intervals are borrowed from published spaced-repetition research, not
 * measured on this app's students.</b> These tests assert that the ladder behaves as decided; they
 * assert nothing about whether the intervals are right for this product, and no test could.
 */
class RevisionLadderTest {

    @Test
    void aShakyTopicComesBackInThreeDays() {
        assertThat(rung("NEEDS_ATTENTION", "PRACTICING"))
                .isEqualTo(new Rung(1, RevisionPlanService.RUNG_1_DAYS, "PERFORMANCE_NEEDS_ATTENTION"));

        // The health model's NEEDS_REVISION — "was strong and has slipped" — is equally urgent, and
        // is a different thing from the curriculum enum's identically-spelled value (D3.1).
        assertThat(rung("NEEDS_REVISION", "PRACTICING").days())
                .isEqualTo(RevisionPlanService.RUNG_1_DAYS);
    }

    @Test
    void aTopicThatIsMovingButNotSettledComesBackInAWeek() {
        assertThat(rung("DEVELOPING", "LEARNING").days()).isEqualTo(RevisionPlanService.RUNG_2_DAYS);
        assertThat(rung("IMPROVING", "PRACTICING").days()).isEqualTo(RevisionPlanService.RUNG_2_DAYS);
    }

    @Test
    void strongClimbsHigherOnceTheCurriculumAgreesItIsMastered() {
        Rung strongOnly = rung("STRONG", "PRACTICING");
        Rung strongAndMastered = rung("STRONG", "MASTERED");

        assertThat(strongOnly.days()).isEqualTo(RevisionPlanService.RUNG_3_DAYS);
        assertThat(strongAndMastered.days()).isEqualTo(RevisionPlanService.RUNG_4_DAYS);

        // This is the whole point of reading both dimensions instead of one flattened label:
        // performing well is not the same as having covered the topic, and they earn different
        // spacing.
        assertThat(strongAndMastered.days()).isGreaterThan(strongOnly.days());
        assertThat(strongAndMastered.reason()).isEqualTo("STRONG_AND_MASTERED");
    }

    @Test
    void theLadderIsMonotonic() {
        // A weaker topic never waits longer than a stronger one. Asserted directly because it is
        // the property a reader assumes, and a future retune could break it silently.
        assertThat(rung("NEEDS_ATTENTION", "PRACTICING").days())
                .isLessThan(rung("DEVELOPING", "PRACTICING").days());
        assertThat(rung("DEVELOPING", "PRACTICING").days())
                .isLessThan(rung("STRONG", "PRACTICING").days());
        assertThat(rung("STRONG", "PRACTICING").days())
                .isLessThan(rung("STRONG", "MASTERED").days());
    }

    @Test
    void aTopicWithNothingMeasuredIsNotScheduledAtAll() {
        // Never measured: nothing to keep fresh. This is the roadmap's learning path, not revision.
        assertThat(RevisionPlanService.rungFor(topic(null, "NOT_STARTED"))).isNull();

        // Measured but not yet judgeable — deliberately distinct from the case above, and equally
        // not a revision candidate: there is no verdict to keep fresh.
        assertThat(RevisionPlanService.rungFor(topic("INSUFFICIENT_DATA", "LEARNING"))).isNull();
    }

    @Test
    void anUnrecognisedStateIsLeftUnscheduledRatherThanDefaulted() {
        // Inventing a due date for a verdict this service does not understand would be worse than
        // admitting it does not know — the same posture the null rules take everywhere else here.
        assertThat(RevisionPlanService.rungFor(topic("SOME_FUTURE_STATE", "PRACTICING"))).isNull();
    }

    private static Rung rung(String performanceState, String curriculumState) {
        Rung rung = RevisionPlanService.rungFor(topic(performanceState, curriculumState));
        assertThat(rung).as("expected a rung for %s / %s", performanceState, curriculumState)
                .isNotNull();
        return rung;
    }

    /** Only the four fields the ladder reads carry meaning; the rest are placeholders. */
    private static TopicLearningState topic(String performanceState, String curriculumState) {
        return new TopicLearningState(
                UUID.randomUUID(), "Topic", UUID.randomUUID(), "Subject",
                curriculumState, 0, null, null,
                performanceState, null, null, null, null,
                0, null, null, null, null,
                null, null, 10,
                null);
    }
}
