package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.Question;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface QuestionRepository extends JpaRepository<Question, UUID>, JpaSpecificationExecutor<Question>,
        QuestionRepositoryCustom {

    // topic/subject are *-to-one, so joining them here is safe with pagination (no
    // row multiplication). exams/translations are *-to-many and stay lazy, handled
    // by hibernate.default_batch_fetch_size instead — a JOIN FETCH on those would
    // multiply rows per page and break LIMIT/OFFSET-based pagination.
    @Query(
            value = "SELECT q FROM Question q JOIN FETCH q.topic t JOIN FETCH t.subject WHERE q.updatedAt > :since "
                    + "AND (:poolEnabled = false OR q.id IN (SELECT p.questionId FROM TemporaryQuestionPool p))",
            countQuery = "SELECT count(q) FROM Question q WHERE q.updatedAt > :since "
                    + "AND (:poolEnabled = false OR q.id IN (SELECT p.questionId FROM TemporaryQuestionPool p))"
    )
    Page<Question> findByUpdatedAtAfter(@Param("since") OffsetDateTime since,
                                         @Param("poolEnabled") boolean poolEnabled,
                                         Pageable pageable);

    /* --------------------------------------------- Duplicate detection (TICKET-2109) */

    /**
     * Candidate duplicates of a given fingerprint, excluding the row being checked itself
     * and anything already soft-deleted (re-flagging a question an admin has already
     * removed would fill the review queue with resolved noise).
     *
     * <p>An indexed equality lookup on {@code content_fingerprint}, which is what makes
     * checking against the whole ~37,900-row bank affordable during bulk import — the
     * alternative, comparing normalised text, is a full scan per candidate row.
     *
     * <p>Ordered oldest-first so the caller can treat the first hit as "the original".
     */
    @Query("select q from Question q where q.contentFingerprint = :fingerprint "
            + "and q.deleted = false and (:excludeId is null or q.id <> :excludeId) "
            + "order by q.updatedAt asc")
    List<Question> findByContentFingerprint(@Param("fingerprint") String fingerprint,
                                             @Param("excludeId") UUID excludeId);

    /* ------------------------------------------------ PYQ aggregation (TICKET-2106) */

    /**
     * Per-(topic, year) appearance counts for one exam's PYQ-tagged questions — the raw
     * input {@code TopicIntelligenceService} computes trend and weightage from.
     *
     * <p>Returned as rows of {@code [topicId, pyqYear, count]} rather than a projection
     * interface because the caller immediately reshapes it into a per-topic year histogram;
     * a DTO here would be a pass-through with no readers of its own.
     *
     * <p>One grouped query for a whole exam, not one per topic. A 108-topic exam would
     * otherwise be 108 round trips against a remote Neon database on every recompute — the
     * same 1+N shape already fixed three times in this codebase.
     */
    @Query("select q.topic.id, q.pyqYear, count(q) from Question q join q.exams e "
            + "where e.code = :examCode and q.pyq = true and q.pyqYear is not null "
            + "and q.deleted = false "
            + "group by q.topic.id, q.pyqYear")
    List<Object[]> aggregatePyqByTopicAndYear(@Param("examCode") String examCode);

    /**
     * Total non-deleted question count per topic for one exam, PYQ or not. Used as the
     * coverage input to the priority score: a high-weightage topic the bank barely covers
     * is a different situation from one it covers well, and the score has to see both.
     */
    @Query("select q.topic.id, count(q) from Question q join q.exams e "
            + "where e.code = :examCode and q.deleted = false group by q.topic.id")
    List<Object[]> countByTopicForExam(@Param("examCode") String examCode);
}
