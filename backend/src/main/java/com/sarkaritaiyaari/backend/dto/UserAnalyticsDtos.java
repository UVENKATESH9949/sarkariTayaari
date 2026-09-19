package com.sarkaritaiyaari.backend.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Summarised views of one student's own behaviour (TASK-2801).
 *
 * <h2>Every number here is derived, none is stored</h2>
 * These shapes are computed from {@code user_practice_session_results} and
 * {@code user_mock_attempt_results} on each read. There is no aggregate table behind them and
 * deliberately so: a stored total is a second thing that can be wrong, and every figure here is
 * reproducible from rows that never change. {@code user_topic_health} (V24) is the pattern to
 * follow if one of these ever genuinely needs caching — a rebuildable, versioned cache, never a
 * source of truth.
 *
 * <h2>Nulls are real answers</h2>
 * An accuracy, an average time or a trend is {@code null} when there is nothing to compute it
 * from. None of them falls back to zero, because "answered nothing yet" and "answered everything
 * wrong" are different facts and a planner acting on them would act differently. Clients must
 * render absence as absence.
 *
 * <p>The raw attempt rows are never exposed through these shapes; history lives behind
 * {@code /api/progress} instead.
 */
public final class UserAnalyticsDtos {

    private UserAnalyticsDtos() {
    }

    /**
     * Headline figures.
     *
     * @param totalStudyTimeMs           practice session durations plus mock elapsed time. Practice
     *                                   sessions recorded before V47 carry no duration and
     *                                   contribute nothing — see
     *                                   {@code practiceSessionsWithoutDuration}, which exists so
     *                                   this total is interpretable rather than quietly short.
     * @param currentStreakDays          consecutive days up to and including today with at least
     *                                   one finished session or attempt. Computed in the caller's
     *                                   time zone (see the {@code zone} parameter on the
     *                                   endpoint), because "a day" is not a server fact.
     * @param overallAccuracy            percentage, 0-100, or null when nothing has been attempted.
     */
    public record Overview(
            long totalPracticeSessions,
            long totalMockAttempts,
            long totalQuestionsAttempted,
            long totalCorrect,
            BigDecimal overallAccuracy,
            long totalStudyTimeMs,
            long practiceSessionsWithoutDuration,
            OffsetDateTime lastActiveAt,
            Integer daysSinceLastActivity,
            int currentStreakDays,
            int longestStreakDays
    ) {
    }

    /**
     * One subject's performance.
     *
     * @param averageTimeMs averaged over the attempts that actually carry a time, not over all of
     *                      them — {@code time_ms} is nullable and absent means unmeasured. Null
     *                      when none of them do.
     */
    public record SubjectStat(
            UUID subjectId,
            String subjectName,
            long attempts,
            BigDecimal accuracy,
            Long averageTimeMs,
            BigDecimal practiceAccuracy,
            BigDecimal mockAccuracy,
            OffsetDateTime lastAttemptedAt
    ) {
    }

    /**
     * One topic's performance, as facts only.
     *
     * <p><b>There is deliberately no {@code trend} here.</b> Direction is a judgement about a
     * student, and this endpoint reports what happened rather than what it means. It shipped with
     * one in TASK-2801 and that was a duplicate of {@code user_topic_health.trend_direction},
     * computed over a different window with a different evidence floor, so the two could disagree
     * about the same student and topic. Phase 3 (TASK-3001, D3.1) removed it: the health model
     * owns direction, and {@code GET /api/me/learning-state} is where a caller reads it.
     */
    public record TopicStat(
            UUID topicId,
            String topicName,
            String subjectName,
            long attempts,
            BigDecimal accuracy,
            Long averageTimeMs,
            BigDecimal practiceAccuracy,
            BigDecimal mockAccuracy,
            OffsetDateTime lastAttemptedAt
    ) {
    }

    /** One difficulty band's performance. */
    public record DifficultyStat(
            String difficultyCode,
            String difficultyLabel,
            long attempts,
            BigDecimal accuracy,
            Long averageTimeMs
    ) {
    }

    /** What happened inside one time window. */
    public record ActivitySummary(
            String window,
            OffsetDateTime from,
            long questionsAttempted,
            long correct,
            BigDecimal accuracy,
            long studyTimeMs,
            long practiceSessions,
            long mockAttempts
    ) {
    }

    /**
     * One bucket of a period-over-period series.
     *
     * <p>Buckets with no activity are returned with zero counts and a null accuracy rather than
     * omitted, so a client can plot a continuous axis without inferring the gaps — and so a quiet
     * week reads as a quiet week rather than as missing data.
     */
    public record TrendPoint(
            OffsetDateTime periodStart,
            long questionsAttempted,
            long correct,
            BigDecimal accuracy
    ) {
    }

    /**
     * @param direction IMPROVING / DECLINING / STABLE / INSUFFICIENT_DATA over the whole series.
     *                  A summary of the points below, not an extra measurement.
     */
    public record TrendSeries(
            String bucket,
            List<TrendPoint> points,
            String direction
    ) {
    }
}
