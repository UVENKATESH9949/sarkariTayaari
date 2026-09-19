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
    /**
     * {@code types} implements capability negotiation (V29, TASK-2301 Phase P3) — a
     * soft-deleted question (a tombstone) is deliberately let through regardless of its own
     * type, so an old client that never learns a new type still learns to delete a row it
     * previously downloaded if that row is later removed; only a *new* or *still-live* row of
     * an unsupported type is withheld. The same "tombstone always passes" reasoning extends to
     * {@code contentStatus} (TASK-2501 Phase 2) — a DRAFT/REVIEW candidate must never sync to
     * any device before an admin publishes it, but its later soft-delete (if ever rejected
     * after acceptance) should still propagate.
     */
    @Query(
            value = "SELECT q FROM Question q JOIN FETCH q.topic t JOIN FETCH t.subject WHERE q.updatedAt > :since "
                    + "AND (:poolEnabled = false OR q.id IN (SELECT p.questionId FROM TemporaryQuestionPool p)) "
                    + "AND (q.deleted = true OR q.questionType IN :types) "
                    + "AND (q.deleted = true OR q.contentStatus = com.sarkaritaiyaari.backend.entity.ContentStatus.PUBLISHED)",
            countQuery = "SELECT count(q) FROM Question q WHERE q.updatedAt > :since "
                    + "AND (:poolEnabled = false OR q.id IN (SELECT p.questionId FROM TemporaryQuestionPool p)) "
                    + "AND (q.deleted = true OR q.questionType IN :types) "
                    + "AND (q.deleted = true OR q.contentStatus = com.sarkaritaiyaari.backend.entity.ContentStatus.PUBLISHED)"
    )
    Page<Question> findByUpdatedAtAfter(@Param("since") OffsetDateTime since,
                                         @Param("poolEnabled") boolean poolEnabled,
                                         @Param("types") List<String> types,
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

    /* ------------------------------------- Multi-type question foundation (V25, TASK-2301) */

    /** Set-based, not a full scan into memory — see the backfillDetection precedent this codebase already fixed once. */
    long countByQuestionTypeNot(String questionType);

    long countByAnswerKeyIsNull();

    /**
     * The analytics classification of a batch of questions, for the snapshot written onto each
     * attempt at upload time (V47, TASK-2801).
     *
     * <p>Columns, in order: {@code questionId, topicId, subjectId, difficultyCode, isPyq}.
     * Subject comes through the topic because {@code questions} carries no subject of its own
     * (V2 moved it onto {@code topics}).
     *
     * <p>Soft-deleted questions are <strong>included</strong>. A soft delete is an editorial
     * decision about the question; it says nothing about whether the student answered it, and
     * filtering here would silently drop a real attempt's classification -- the same rule
     * {@link TopicEvidenceRepository} already states for its own reads.
     */
    @Query("select q.id, q.topic.id, q.topic.subject.id, q.difficulty, q.pyq "
            + "from Question q where q.id in :ids")
    List<Object[]> findClassifications(@Param("ids") java.util.Collection<UUID> ids);
}
