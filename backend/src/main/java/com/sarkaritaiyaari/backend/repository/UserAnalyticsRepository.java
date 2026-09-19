package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.UserPracticeSessionResult;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Grouped reads over a student's own attempt history (TASK-2801).
 *
 * <h2>Why this is its own interface</h2>
 * Same reasoning as {@link TopicEvidenceRepository}: {@link UserPracticeSessionRepository} and
 * {@link UserMockAttemptRepository} exist for the write-once upload/restore path and are
 * deliberately tiny. These are analytics aggregates over the <em>result</em> rows — same tables,
 * different job. Extends the narrow {@link Repository} rather than {@code JpaRepository} so
 * {@code save}/{@code deleteAll} are not exposed on immutable history.
 *
 * <h2>Everything here groups by the snapshot, not by a join</h2>
 * Since V47 each attempt carries the topic, subject, difficulty and PYQ flag it was classified
 * as <em>when it was answered</em>. So none of these queries joins {@code questions}: they read
 * what was true at the time, which is what makes a figure stable when content is later retagged,
 * and they avoid a join against the largest table in the schema on every aggregate.
 *
 * <p>Rows whose snapshot is null (a question hard-deleted before V47's backfill ran) are excluded
 * by the {@code is not null} predicates rather than bucketed under a fabricated "Other".
 *
 * <h2>Two counting rules, identical on both sources</h2>
 * <ol>
 *   <li><strong>{@code UNATTEMPTED} is excluded entirely</strong>, never counted as wrong.
 *       Running out of time on a mock is normal; scoring skipped questions as mistakes
 *       manufactures weakness out of the clock.</li>
 *   <li><strong>{@code PENDING_REVIEW} is excluded from both numerator and denominator.</strong>
 *       A descriptive answer awaiting a human reader is attempted but unscored — counting it as
 *       incorrect would understate accuracy for a reason that is about the marking workflow, not
 *       the student. (No such row exists yet: descriptive types are not authoring-enabled.)</li>
 * </ol>
 * Correctness always reads {@code outcome}, never {@code selectedIndex = correctIndex} — that
 * comparison silently mis-scores every MULTIPLE_CHOICE/TRUE_FALSE row, whose index columns are
 * null by design. V26 backfilled {@code outcome} across all history, so it is safe unconditionally.
 *
 * <h2>Column shapes</h2>
 * The per-dimension queries all return the same tuple, so one mapper serves them:
 * {@code [key, attempted, correct, totalTimeMs, timedCount, lastAttemptAt]}.
 * {@code totalTimeMs} and {@code timedCount} are separate because {@code time_ms} is nullable —
 * a sum alone cannot tell "took 40 seconds" from "nobody recorded a time", and an average over
 * the wrong denominator is exactly the fake signal this project refuses to produce.
 */
public interface UserAnalyticsRepository extends Repository<UserPracticeSessionResult, String> {

    String COUNTED = " and r.outcome <> 'UNATTEMPTED' and r.outcome <> 'PENDING_REVIEW' ";

    /* ------------------------------------------------------------------ by topic */

    @Query("select r.topicId, count(r), sum(case when r.outcome = 'CORRECT' then 1 else 0 end), "
            + "sum(r.timeMs), count(r.timeMs), max(s.completedAt) "
            + "from UserPracticeSessionResult r join r.session s "
            + "where s.user.id = :userId and s.completedAt >= :since and r.topicId is not null"
            + COUNTED
            + "group by r.topicId")
    List<Object[]> practiceByTopic(@Param("userId") UUID userId, @Param("since") OffsetDateTime since);

    @Query("select r.topicId, count(r), sum(case when r.outcome = 'CORRECT' then 1 else 0 end), "
            + "sum(r.timeMs), count(r.timeMs), max(a.completedAt) "
            + "from UserMockAttemptResult r join r.attempt a "
            + "where a.user.id = :userId and a.completedAt >= :since and r.topicId is not null"
            + COUNTED
            + "group by r.topicId")
    List<Object[]> mockByTopic(@Param("userId") UUID userId, @Param("since") OffsetDateTime since);

    /* ---------------------------------------------------------------- by subject */

    @Query("select r.subjectId, count(r), sum(case when r.outcome = 'CORRECT' then 1 else 0 end), "
            + "sum(r.timeMs), count(r.timeMs), max(s.completedAt) "
            + "from UserPracticeSessionResult r join r.session s "
            + "where s.user.id = :userId and s.completedAt >= :since and r.subjectId is not null"
            + COUNTED
            + "group by r.subjectId")
    List<Object[]> practiceBySubject(@Param("userId") UUID userId, @Param("since") OffsetDateTime since);

    @Query("select r.subjectId, count(r), sum(case when r.outcome = 'CORRECT' then 1 else 0 end), "
            + "sum(r.timeMs), count(r.timeMs), max(a.completedAt) "
            + "from UserMockAttemptResult r join r.attempt a "
            + "where a.user.id = :userId and a.completedAt >= :since and r.subjectId is not null"
            + COUNTED
            + "group by r.subjectId")
    List<Object[]> mockBySubject(@Param("userId") UUID userId, @Param("since") OffsetDateTime since);

    /* ------------------------------------------------------------- by difficulty */

    @Query("select r.difficultyCode, count(r), sum(case when r.outcome = 'CORRECT' then 1 else 0 end), "
            + "sum(r.timeMs), count(r.timeMs), max(s.completedAt) "
            + "from UserPracticeSessionResult r join r.session s "
            + "where s.user.id = :userId and s.completedAt >= :since and r.difficultyCode is not null"
            + COUNTED
            + "group by r.difficultyCode")
    List<Object[]> practiceByDifficulty(@Param("userId") UUID userId, @Param("since") OffsetDateTime since);

    @Query("select r.difficultyCode, count(r), sum(case when r.outcome = 'CORRECT' then 1 else 0 end), "
            + "sum(r.timeMs), count(r.timeMs), max(a.completedAt) "
            + "from UserMockAttemptResult r join r.attempt a "
            + "where a.user.id = :userId and a.completedAt >= :since and r.difficultyCode is not null"
            + COUNTED
            + "group by r.difficultyCode")
    List<Object[]> mockByDifficulty(@Param("userId") UUID userId, @Param("since") OffsetDateTime since);

    /* ------------------------------------------------------------------- overview
     * One row each, so the overview costs two grouped reads rather than pulling history.
     * Columns: [attempted, correct, totalTimeMs, timedCount].
     */

    @Query("select count(r), sum(case when r.outcome = 'CORRECT' then 1 else 0 end), "
            + "sum(r.timeMs), count(r.timeMs) "
            + "from UserPracticeSessionResult r join r.session s "
            + "where s.user.id = :userId and s.completedAt >= :since"
            + COUNTED)
    List<Object[]> practiceTotals(@Param("userId") UUID userId, @Param("since") OffsetDateTime since);

    @Query("select count(r), sum(case when r.outcome = 'CORRECT' then 1 else 0 end), "
            + "sum(r.timeMs), count(r.timeMs) "
            + "from UserMockAttemptResult r join r.attempt a "
            + "where a.user.id = :userId and a.completedAt >= :since"
            + COUNTED)
    List<Object[]> mockTotals(@Param("userId") UUID userId, @Param("since") OffsetDateTime since);

    /* -------------------------------------------------------------- session-level
     * Read off the parent rows, which already hold their own counts — so study time, session
     * counts, streaks and period trends never touch the per-question tables at all. Served
     * straight off idx_user_practice_sessions_user / idx_user_mock_attempts_user
     * (user_id, completed_at DESC).
     *
     * Columns: [completedAt, correctCount, attemptedCount, studyTimeMs].
     *
     * `durationMs` is null for every practice session recorded before V47 — the caller counts
     * those separately rather than letting them read as zero-length study.
     */

    @Query("select s.completedAt, s.correctCount, s.totalCount, s.durationMs "
            + "from UserPracticeSession s "
            + "where s.user.id = :userId and s.completedAt >= :since "
            + "order by s.completedAt asc")
    List<Object[]> practiceSessionRows(@Param("userId") UUID userId, @Param("since") OffsetDateTime since);

    /**
     * Mock attempts, with accuracy's denominator as {@code correct + wrong} rather than
     * {@code totalQuestions}. Part-finishing a timed paper is normal, and dividing by the paper
     * size reports a student who answered 3 of 100 as 2% — a real shipped bug this project has
     * already fixed once on the AI feedback path (see {@code reports/}); it is not repeated here.
     *
     * <p>{@code timeTakenSeconds} is always recorded, so unlike practice there is no unmeasured case.
     */
    @Query("select a.completedAt, a.correctCount, a.correctCount + a.wrongCount, a.timeTakenSeconds "
            + "from UserMockAttempt a "
            + "where a.user.id = :userId and a.completedAt >= :since "
            + "order by a.completedAt asc")
    List<Object[]> mockAttemptRows(@Param("userId") UUID userId, @Param("since") OffsetDateTime since);
}
