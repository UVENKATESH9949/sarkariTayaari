package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.UserTopicHealth;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public interface UserTopicHealthRepository extends JpaRepository<UserTopicHealth, String> {

    /**
     * Every health row this student has at the given algorithm version.
     *
     * <p>Join-fetches topic and subject because every consumer — the radar response, the
     * admin debug view — needs both names. Without the fetch this is a textbook 1+N over
     * however many topics the student has practised, on the feature's only read path.
     */
    @Query("select h from UserTopicHealth h join fetch h.topic t join fetch t.subject "
            + "where h.user.id = :userId and h.algorithmVersion = :version")
    List<UserTopicHealth> findForUserAndVersion(@Param("userId") UUID userId,
                                                  @Param("version") String version);

    /*
     * ------------------------------------------------------------------ Staleness probes
     *
     * Scalar projections, not entities, and that is load-bearing: the recompute path bulk-
     * deletes these rows and then saves new ones with the same synthetic ids. A managed copy
     * surviving the delete is the exact shape that produced real 500s in this codebase before
     * (see TopicPriorityRepository.findOverridesForExam's own comment), so the freshness check
     * must never load one.
     *
     * All rows from a single recompute share one computed_at / evidence_through_at, so min()
     * and max() agree; min() is used so a partially-written set can only ever read as staler
     * than it is, never fresher.
     */

    @Query("select count(h) from UserTopicHealth h "
            + "where h.user.id = :userId and h.algorithmVersion = :version")
    long countForUserAndVersion(@Param("userId") UUID userId, @Param("version") String version);

    @Query("select min(h.evidenceThroughAt) from UserTopicHealth h "
            + "where h.user.id = :userId and h.algorithmVersion = :version")
    OffsetDateTime oldestEvidenceThrough(@Param("userId") UUID userId, @Param("version") String version);

    @Query("select min(h.computedAt) from UserTopicHealth h "
            + "where h.user.id = :userId and h.algorithmVersion = :version")
    OffsetDateTime oldestComputedAt(@Param("userId") UUID userId, @Param("version") String version);

    /**
     * Clears this student's cached health, whatever version produced it.
     *
     * <p>Version-agnostic on purpose. Unlike {@code topic_priority}, rows from a superseded
     * algorithm version are worth nothing here — they hold no editorial content and the raw
     * attempts reproduce the current answer exactly — so leaving them behind would be dead
     * weight multiplied by every student. See V24's own comment.
     *
     * <p>Explicit query with its own {@code @Transactional} rather than a derived delete, for
     * the same reason as {@link UserTopicProgressRepository#deleteByUserId} —
     * {@code SimpleJpaRepository} only wraps its own CRUD methods, so a derived delete called
     * from a non-transactional caller (a test teardown) fails with
     * {@code TransactionRequiredException}.
     */
    @Modifying
    @Transactional
    @Query("delete from UserTopicHealth h where h.user.id = :userId")
    void deleteByUserId(@Param("userId") UUID userId);

    @Modifying
    @Transactional
    @Query("delete from UserTopicHealth h where h.topic.id = :topicId")
    void deleteByTopicId(@Param("topicId") UUID topicId);
}
