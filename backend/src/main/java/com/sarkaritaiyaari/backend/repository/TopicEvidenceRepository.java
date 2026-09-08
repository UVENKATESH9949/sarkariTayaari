package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.UserPracticeSessionResult;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * The raw evidence Weakness Radar scores from (see {@code tasks/TASK-2201-weakness-radar.md}).
 *
 * <h2>Why this is its own interface</h2>
 * These are analytics reads over the <em>result</em> rows, whereas
 * {@link UserPracticeSessionRepository} and {@link UserMockAttemptRepository} exist for the
 * write-once upload/restore sync path and are deliberately tiny. Keeping a grouped
 * cross-entity aggregate out of them follows the same reasoning that made
 * {@code PreparePlanService} its own service: same tables, different job.
 *
 * <h2>Why the topic, difficulty and PYQ flag are joined rather than stored</h2>
 * Neither result table carries a topic, a difficulty or a PYQ flag — but both carry
 * {@code question_id}, and {@code questions} carries all three. So none of it needed a new
 * column; the supplied §3 instruction to check whether a signal is genuinely missing before
 * adding a field is what this join is.
 *
 * <h2>One grouped query per source, not one per topic</h2>
 * Both queries return one row per (topic, attempt-event, difficulty, PYQ flag) with the
 * counts already summed — the 1+N shape this codebase has now fixed five times would here be
 * a query per topic per student, on a screen meant to open quickly.
 *
 * <p>Extends the narrow {@link Repository} rather than {@code JpaRepository}: nothing here
 * writes, and exposing {@code save}/{@code deleteAll} on immutable attempt history would be
 * an invitation.
 */
public interface TopicEvidenceRepository extends Repository<UserPracticeSessionResult, String> {

    /**
     * Practice-session evidence for one student.
     *
     * <p>Columns, in order: {@code topicId, eventId, occurredAt, difficultyCode, isPyq,
     * answeredCount, correctCount, totalTimeMs, timedAnswerCount}.
     *
     * <p>{@code totalTimeMs} and {@code timedAnswerCount} are separate on purpose:
     * {@code time_ms} is nullable (every row uploaded before V24 has none), and a sum alone
     * cannot distinguish "took 40 seconds in total" from "nobody recorded a time". A reader
     * that ignored the count would compute a pace from partial data — which §9's "a missing
     * signal must not become fake data" forbids.
     *
     * <p><strong>Soft-deleted questions are included deliberately.</strong> A soft delete is
     * an editorial decision about the question, not about whether the student answered it.
     * Filtering them out would silently rewrite a student's history and make their health
     * move for a reason they cannot see or act on.
     */
    @Query("select q.topic.id, s.id, s.completedAt, q.difficulty, q.pyq, "
            + "count(r), sum(case when r.correct = true then 1 else 0 end), "
            + "sum(r.timeMs), count(r.timeMs) "
            + "from UserPracticeSessionResult r "
            + "join r.session s "
            + "join Question q on q.id = r.questionId "
            + "where s.user.id = :userId and s.completedAt >= :since "
            + "group by q.topic.id, s.id, s.completedAt, q.difficulty, q.pyq "
            + "order by q.topic.id asc, s.completedAt asc")
    List<Object[]> practiceEvidence(@Param("userId") UUID userId,
                                     @Param("since") OffsetDateTime since);

    /**
     * Mock-attempt evidence for one student, same column shape as
     * {@link #practiceEvidence}.
     *
     * <p>Two differences from practice, both load-bearing:
     * <ul>
     *   <li>Correctness is read from {@code outcome} (V26), not derived from
     *       {@code selected_index = correct_index} — that comparison silently mis-scores a
     *       MULTIPLE_CHOICE/TRUE_FALSE row as wrong, since neither column has any meaning for
     *       those types. Safe to trust unconditionally because V26's own migration backfilled
     *       {@code outcome} for every row that predates it, including historical
     *       SINGLE_CHOICE rows — there is no "old row" case this needs to fall back for.</li>
     *   <li>{@code outcome = 'UNATTEMPTED'} means the question was left <strong>unattempted</strong>,
     *       and those rows are excluded entirely rather than counted as wrong. Counting a
     *       skipped question as a mistake would manufacture weaknesses out of a student
     *       running out of time — the single easiest way to get this feature wrong. (Before
     *       V26 this was expressed as {@code selected_index is not null}, which stopped being
     *       correct the moment a non-index type's selected_index was always null regardless of
     *       whether it was actually attempted.)</li>
     * </ul>
     */
    @Query("select q.topic.id, a.id, a.completedAt, q.difficulty, q.pyq, "
            + "count(r), sum(case when r.outcome = 'CORRECT' then 1 else 0 end), "
            + "sum(r.timeMs), count(r.timeMs) "
            + "from UserMockAttemptResult r "
            + "join r.attempt a "
            + "join Question q on q.id = r.questionId "
            + "where a.user.id = :userId and a.completedAt >= :since "
            + "and r.outcome <> 'UNATTEMPTED' "
            + "group by q.topic.id, a.id, a.completedAt, q.difficulty, q.pyq "
            + "order by q.topic.id asc, a.completedAt asc")
    List<Object[]> mockEvidence(@Param("userId") UUID userId,
                                 @Param("since") OffsetDateTime since);

    /**
     * The student's newest practice session, or null if they have none.
     *
     * <p>Half of the staleness check: served straight off
     * {@code idx_user_practice_sessions_user (user_id, completed_at DESC)}, so asking "is the
     * cached health still current?" costs an index probe rather than a scan of the history.
     */
    @Query("select max(s.completedAt) from UserPracticeSession s where s.user.id = :userId")
    OffsetDateTime latestPracticeAt(@Param("userId") UUID userId);

    /** The other half. Same index shape on {@code user_mock_attempts}. */
    @Query("select max(a.completedAt) from UserMockAttempt a where a.user.id = :userId")
    OffsetDateTime latestMockAt(@Param("userId") UUID userId);
}
