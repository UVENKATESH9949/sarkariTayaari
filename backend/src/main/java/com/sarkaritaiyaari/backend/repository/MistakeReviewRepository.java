package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.UserPracticeSessionResult;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Questions this student actually got wrong, counted per topic (TASK-3501, the Mistake Review task).
 *
 * <h2>Why no new table was needed</h2>
 * Both result tables already carry {@code outcome} (V26 backfilled it across all history) and, since
 * V47, a {@code topic_id} frozen at upload. So "which topics has this student been getting wrong
 * lately" is a grouped count over rows that already exist — and the frozen topic id is what makes it
 * honest, because joining {@code questions} live would let a question retagged since silently change
 * what a past mistake looks like.
 *
 * <p>The question text, the answer chosen, the correct answer and the explanation are deliberately
 * NOT fetched here. The client already holds all four for every wrong answer it has ever recorded
 * (mobile's own {@code SessionRecord.results}, rendered by Revise's Wrong Answers tab), so a
 * mistake-review task only has to say <i>which topic and how many</i> — anything more would be a
 * second copy of content the device already has.
 *
 * <p>{@code INCORRECT} specifically, not "everything that is not CORRECT": an unattempted question
 * on a timed paper is a clock problem, and one awaiting review has no verdict yet. Neither is a
 * mistake, and counting them as one would manufacture mistakes out of running out of time — the same
 * rule {@code TaskOutcomeRepository} and the analytics service already apply.
 */
public interface MistakeReviewRepository extends Repository<UserPracticeSessionResult, String> {

    /** @return rows of {@code [topicId, wrongCount, mostRecentAt]} from practice since the window opened. */
    @Query("select r.topicId, count(r), max(s.completedAt) "
            + "from UserPracticeSessionResult r join r.session s "
            + "where s.user.id = :userId and s.completedAt >= :since "
            + "and r.topicId is not null and r.outcome = 'INCORRECT' "
            + "group by r.topicId")
    List<Object[]> practiceMistakesByTopic(@Param("userId") UUID userId,
                                           @Param("since") OffsetDateTime since);

    /** @return rows of {@code [topicId, wrongCount, mostRecentAt]} from mock attempts, same window. */
    @Query("select r.topicId, count(r), max(a.completedAt) "
            + "from UserMockAttemptResult r join r.attempt a "
            + "where a.user.id = :userId and a.completedAt >= :since "
            + "and r.topicId is not null and r.outcome = 'INCORRECT' "
            + "group by r.topicId")
    List<Object[]> mockMistakesByTopic(@Param("userId") UUID userId,
                                        @Param("since") OffsetDateTime since);
}
