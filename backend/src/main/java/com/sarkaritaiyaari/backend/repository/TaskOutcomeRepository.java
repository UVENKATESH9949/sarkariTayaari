package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.UserPracticeSessionResult;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * What a student actually answered, per topic, within one day (TASK-3401, Phase 6).
 *
 * <h2>Why this can exist at all</h2>
 * Migration V47 froze {@code topic_id} onto every attempt row at upload time. Without it, answering
 * "did they practise the topic we assigned?" would mean joining {@code questions} live — and a
 * question retagged since would silently change what a past day looks like, which is precisely the
 * history-rewriting V47 was written to stop.
 *
 * <p>Bounded to one day rather than "since": a task belongs to a calendar day, so work done the
 * next morning is the next day's, not late credit for yesterday. The caller resolves the day's
 * bounds in the student's own zone — the one stored on the task.
 *
 * <p>{@code COUNTED} mirrors the analytics rule: an unattempted or awaiting-review answer is not
 * evidence that the work was done.
 */
public interface TaskOutcomeRepository extends Repository<UserPracticeSessionResult, String> {

    String COUNTED = " and r.outcome <> 'UNATTEMPTED' and r.outcome <> 'PENDING_REVIEW' ";

    /** @return rows of {@code [topicId, answered, correct]} from practice within the window. */
    @Query("select r.topicId, count(r), sum(case when r.outcome = 'CORRECT' then 1 else 0 end) "
            + "from UserPracticeSessionResult r join r.session s "
            + "where s.user.id = :userId and s.completedAt >= :from and s.completedAt < :to "
            + "and r.topicId is not null"
            + COUNTED
            + "group by r.topicId")
    List<Object[]> practiceByTopicInWindow(@Param("userId") UUID userId,
                                           @Param("from") OffsetDateTime from,
                                           @Param("to") OffsetDateTime to);

    /** @return rows of {@code [topicId, answered, correct]} from mock attempts within the window. */
    @Query("select r.topicId, count(r), sum(case when r.outcome = 'CORRECT' then 1 else 0 end) "
            + "from UserMockAttemptResult r join r.attempt a "
            + "where a.user.id = :userId and a.completedAt >= :from and a.completedAt < :to "
            + "and r.topicId is not null"
            + COUNTED
            + "group by r.topicId")
    List<Object[]> mockByTopicInWindow(@Param("userId") UUID userId,
                                        @Param("from") OffsetDateTime from,
                                        @Param("to") OffsetDateTime to);
}
