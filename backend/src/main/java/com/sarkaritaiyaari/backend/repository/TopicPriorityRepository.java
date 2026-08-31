package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.TopicPriority;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TopicPriorityRepository extends JpaRepository<TopicPriority, String> {

    /** Ordered by what consumers actually rank on. Nulls last so unscored topics sink. */
    @Query("select p from TopicPriority p join fetch p.topic tp join fetch tp.subject "
            + "where p.exam.code = :examCode and p.algorithmVersion = :version "
            + "order by p.finalPriority desc nulls last, tp.name asc")
    List<TopicPriority> findForExamAndVersion(@Param("examCode") String examCode,
                                               @Param("version") String version);

    @Query("select p from TopicPriority p where p.exam.code = :examCode "
            + "and p.topic.id = :topicId and p.algorithmVersion = :version")
    Optional<TopicPriority> findOne(@Param("examCode") String examCode,
                                     @Param("topicId") UUID topicId,
                                     @Param("version") String version);

    /**
     * Every override currently in force for an exam, at any algorithm version.
     *
     * <p>Read by the recalculation job so a recompute can carry existing overrides forward
     * onto the new version's rows. Without this, bumping the algorithm version would produce
     * a fresh set of rows with {@code admin_override = null} and quietly discard every
     * editorial decision ever made — which is exactly what §66 exists to prevent.
     *
     * <p><strong>A projection, not entities, and that is load-bearing.</strong> Returning managed
     * {@code TopicPriority} instances broke {@code recompute}: the bulk delete that follows does not
     * evict them from the persistence context, so re-saving rows with the same synthetic ids took
     * {@code merge()}'s path against still-managed copies of rows that had just been deleted, and
     * the recompute failed with a 500. It only reproduced when an override already existed at the
     * version being recomputed — i.e. the ordinary production sequence of
     * recompute → override → recompute.
     *
     * <p>Columns, in order: {@code topicId, adminOverride, overrideReason, overrideBy, overrideAt}.
     *
     * <p><strong>Newest first, and the caller must keep only the first hit per topic.</strong>
     * Rows from superseded algorithm versions stay on disk by design, so an unordered query
     * would let a stale override from an old version resurrect one an admin has since cleared
     * on the current version. Ordering by {@code computedAt} makes "the most recent decision
     * wins" explicit rather than accidental.
     */
    @Query("select p.topic.id, p.adminOverride, p.overrideReason, p.overrideBy, p.overrideAt "
            + "from TopicPriority p where p.exam.code = :examCode and p.adminOverride is not null "
            + "order by p.computedAt desc, p.algorithmVersion desc")
    List<Object[]> findOverridesForExam(@Param("examCode") String examCode);

    @Modifying
    @Transactional
    @Query("delete from TopicPriority p where p.exam.code = :examCode and p.algorithmVersion = :version")
    void deleteByExamCodeAndVersion(@Param("examCode") String examCode, @Param("version") String version);

    @Modifying
    @Transactional
    @Query("delete from TopicPriority p where p.exam.code = :examCode")
    void deleteByExamCode(@Param("examCode") String examCode);

    @Modifying
    @Transactional
    @Query("delete from TopicPriority p where p.topic.id = :topicId")
    void deleteByTopicId(@Param("topicId") UUID topicId);
}
