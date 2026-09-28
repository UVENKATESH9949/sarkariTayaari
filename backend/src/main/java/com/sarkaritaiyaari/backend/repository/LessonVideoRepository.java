package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.LessonVideo;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Note the field names in every query below are the ENTITY field names
 * ({@code deleted}, not {@code isDeleted}). Spring Data resolves against the field, never the
 * accessor - this project has already lost time to that exact mismatch more than once.
 */
public interface LessonVideoRepository extends JpaRepository<LessonVideo, UUID> {

    /**
     * The hot read behind "does this topic have a video I can play". Ordered so that, if a
     * uniqueness rule is ever relaxed, the newest published row wins rather than an arbitrary one.
     */
    @Query("""
            SELECT v FROM LessonVideo v
            WHERE v.topicId = :topicId
              AND v.languageCode = :languageCode
              AND v.teachingLevel = :teachingLevel
              AND v.quality = :quality
              AND v.deleted = false
              AND v.contentStatus = com.sarkaritaiyaari.backend.entity.ContentStatus.PUBLISHED
            ORDER BY v.contentVersion DESC
            """)
    List<LessonVideo> findPublishedForTopic(@Param("topicId") UUID topicId,
                                            @Param("languageCode") String languageCode,
                                            @Param("teachingLevel") com.sarkaritaiyaari.backend.entity.TeachingLevel teachingLevel,
                                            @Param("quality") com.sarkaritaiyaari.backend.entity.VideoQuality quality);

    @Query("""
            SELECT v FROM LessonVideo v
            WHERE v.questionId = :questionId
              AND v.languageCode = :languageCode
              AND v.teachingLevel = :teachingLevel
              AND v.quality = :quality
              AND v.deleted = false
              AND v.contentStatus = com.sarkaritaiyaari.backend.entity.ContentStatus.PUBLISHED
            ORDER BY v.contentVersion DESC
            """)
    List<LessonVideo> findPublishedForQuestion(@Param("questionId") UUID questionId,
                                               @Param("languageCode") String languageCode,
                                               @Param("teachingLevel") com.sarkaritaiyaari.backend.entity.TeachingLevel teachingLevel,
                                               @Param("quality") com.sarkaritaiyaari.backend.entity.VideoQuality quality);

    /**
     * Any non-deleted row for an owner regardless of status. This is what answers "is generation
     * already running", which is why it must NOT filter on published.
     */
    @Query("""
            SELECT v FROM LessonVideo v
            WHERE v.deleted = false
              AND v.languageCode = :languageCode
              AND v.teachingLevel = :teachingLevel
              AND ((:topicId IS NOT NULL AND v.topicId = :topicId)
                OR (:questionId IS NOT NULL AND v.questionId = :questionId))
            ORDER BY v.createdAt DESC
            """)
    List<LessonVideo> findAnyForOwner(@Param("topicId") UUID topicId,
                                      @Param("questionId") UUID questionId,
                                      @Param("languageCode") String languageCode,
                                      @Param("teachingLevel") com.sarkaritaiyaari.backend.entity.TeachingLevel teachingLevel);

    /**
     * Every published topic video, optionally narrowed to one subject.
     *
     * <p>This is what makes an AI Videos browse screen affordable. The alternative - asking
     * "does this topic have a video" once per topic - is 61 round trips for SSC CGL alone, on a
     * connection this product assumes is slow. The answer here is sparse: it returns only topics
     * that actually have a video, so a client that already holds the topic list locally can mark
     * them up without the response carrying the whole syllabus back.
     *
     * <p>{@code subjectId} is optional from day one so that, if the published set ever grows past
     * what one response should carry, narrowing it is a parameter rather than a contract change.
     * The null-or-match shape matches {@code findAnyForOwner} above.
     */
    @Query("""
            SELECT v FROM LessonVideo v
            WHERE v.deleted = false
              AND v.topicId IS NOT NULL
              AND v.languageCode = :languageCode
              AND v.teachingLevel = :teachingLevel
              AND v.quality = :quality
              AND v.contentStatus = com.sarkaritaiyaari.backend.entity.ContentStatus.PUBLISHED
              AND (:subjectId IS NULL OR v.topicId IN (
                    SELECT t.id FROM Topic t WHERE t.subject.id = :subjectId))
            ORDER BY v.topicId ASC, v.contentVersion DESC
            """)
    List<LessonVideo> findPublishedTopicCatalog(
            @Param("subjectId") UUID subjectId,
            @Param("languageCode") String languageCode,
            @Param("teachingLevel") com.sarkaritaiyaari.backend.entity.TeachingLevel teachingLevel,
            @Param("quality") com.sarkaritaiyaari.backend.entity.VideoQuality quality);

    Optional<LessonVideo> findByIdAndDeletedFalse(UUID id);

    List<LessonVideo> findAllByDeletedFalseOrderByCreatedAtDesc();

    List<LessonVideo> findAllByTopicIdAndDeletedFalseOrderByCreatedAtDesc(UUID topicId);
}
