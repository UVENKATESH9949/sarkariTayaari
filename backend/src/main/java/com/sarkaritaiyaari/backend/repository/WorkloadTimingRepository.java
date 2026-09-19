package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.UserPracticeSessionResult;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * Cohort timing — how long a question actually takes, averaged across <b>every</b> student
 * rather than one. TASK-3101 (Phase 4): the input that lets a roadmap put minutes against a topic
 * the calling student has never practised.
 *
 * <h2>Why this is not on {@link UserAnalyticsRepository}</h2>
 * Every query there is scoped to one user and exists to answer "how is <i>this</i> student doing".
 * These are deliberately unscoped aggregates, and mixing them into that interface would put a
 * query with no {@code userId} parameter one line away from queries whose whole safety property is
 * that they have one. Nothing here can return anything about an identifiable student: the select
 * lists carry a topic id, a difficulty code, an average and a count, and never a user.
 *
 * <h2>Cost</h2>
 * These scan attempt rows across all students, bounded to the same 365-day window
 * {@code UserAnalyticsService} uses so the figure means the same thing on both sides. They are
 * therefore the most expensive thing a roadmap read does, and they are <b>not</b> measured against
 * a heavy account — recorded as an open item rather than assumed cheap. If it becomes a problem the
 * answer is a small periodically-rebuilt aggregate, the same shape {@code user_topic_health}
 * already uses, not a smaller window.
 *
 * <p>{@code COUNTED} mirrors the analytics rule exactly: an unattempted or awaiting-review answer
 * is not evidence of how long a question takes.
 */
public interface WorkloadTimingRepository extends Repository<UserPracticeSessionResult, String> {

    String COUNTED = " and r.outcome <> 'UNATTEMPTED' and r.outcome <> 'PENDING_REVIEW' ";

    /** @return rows of {@code [topicId, avgTimeMs, sampleSize]} across all students. */
    @Query("select r.topicId, avg(r.timeMs), count(r.timeMs) "
            + "from UserPracticeSessionResult r join r.session s "
            + "where s.completedAt >= :since and r.topicId is not null and r.timeMs is not null"
            + COUNTED
            + "group by r.topicId")
    List<Object[]> cohortPracticeByTopic(@Param("since") OffsetDateTime since);

    /** @return rows of {@code [topicId, avgTimeMs, sampleSize]} across all students. */
    @Query("select r.topicId, avg(r.timeMs), count(r.timeMs) "
            + "from UserMockAttemptResult r join r.attempt a "
            + "where a.completedAt >= :since and r.topicId is not null and r.timeMs is not null"
            + COUNTED
            + "group by r.topicId")
    List<Object[]> cohortMockByTopic(@Param("since") OffsetDateTime since);

    /** @return rows of {@code [difficultyCode, avgTimeMs, sampleSize]} across all students. */
    @Query("select r.difficultyCode, avg(r.timeMs), count(r.timeMs) "
            + "from UserPracticeSessionResult r join r.session s "
            + "where s.completedAt >= :since and r.difficultyCode is not null and r.timeMs is not null"
            + COUNTED
            + "group by r.difficultyCode")
    List<Object[]> cohortPracticeByDifficulty(@Param("since") OffsetDateTime since);

    /** @return rows of {@code [difficultyCode, avgTimeMs, sampleSize]} across all students. */
    @Query("select r.difficultyCode, avg(r.timeMs), count(r.timeMs) "
            + "from UserMockAttemptResult r join r.attempt a "
            + "where a.completedAt >= :since and r.difficultyCode is not null and r.timeMs is not null"
            + COUNTED
            + "group by r.difficultyCode")
    List<Object[]> cohortMockByDifficulty(@Param("since") OffsetDateTime since);

    /* ------------------------------------------------------- this student, for tier 1 */

    /**
     * The calling student's own timed attempts per topic.
     *
     * <p>Same formula as {@code UserAnalyticsService}'s {@code averageTimeMs} — pooled over practice
     * and mock, divided by the attempts that actually carry a time — so the two cannot report a
     * different average for the same student and topic. What this adds is the <b>timed</b> sample
     * size, which the analytics shape does not carry: its {@code attempts} counts every counted
     * attempt, timed or not, so it cannot be used as the floor for trusting an average.
     *
     * @return rows of {@code [topicId, avgTimeMs, sampleSize]}
     */
    @Query("select r.topicId, avg(r.timeMs), count(r.timeMs) "
            + "from UserPracticeSessionResult r join r.session s "
            + "where s.user.id = :userId and s.completedAt >= :since "
            + "and r.topicId is not null and r.timeMs is not null"
            + COUNTED
            + "group by r.topicId")
    List<Object[]> personalPracticeByTopic(@Param("userId") java.util.UUID userId,
                                           @Param("since") OffsetDateTime since);

    /** @return rows of {@code [topicId, avgTimeMs, sampleSize]} for the calling student. */
    @Query("select r.topicId, avg(r.timeMs), count(r.timeMs) "
            + "from UserMockAttemptResult r join r.attempt a "
            + "where a.user.id = :userId and a.completedAt >= :since "
            + "and r.topicId is not null and r.timeMs is not null"
            + COUNTED
            + "group by r.topicId")
    List<Object[]> personalMockByTopic(@Param("userId") java.util.UUID userId,
                                       @Param("since") OffsetDateTime since);
}
