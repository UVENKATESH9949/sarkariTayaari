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

    Optional<LessonVideo> findByIdAndDeletedFalse(UUID id);

    List<LessonVideo> findAllByDeletedFalseOrderByCreatedAtDesc();

    List<LessonVideo> findAllByTopicIdAndDeletedFalseOrderByCreatedAtDesc(UUID topicId);
}
