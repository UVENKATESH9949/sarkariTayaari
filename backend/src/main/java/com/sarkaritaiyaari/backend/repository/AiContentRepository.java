package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.AiContent;
import com.sarkaritaiyaari.backend.entity.AiContentTask;
import com.sarkaritaiyaari.backend.entity.ContentStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * TASK-2701 Phase 2. Explicit {@code @Query} for anything with a join or an ordering
 * requirement, matching this codebase's own preference for certainty over a derived name once a
 * query stops being a single-field lookup (see {@code QuestionCandidateRepository}'s history of
 * exactly this trade-off).
 */
public interface AiContentRepository extends JpaRepository<AiContent, UUID> {

    /**
     * "Does a live (non-superseded) row already exist for this question/task/language" — asked
     * once per candidate on every generation pass. An explicit {@code @Query} rather than a
     * derived name: Spring Data derives a property from the entity's FIELD name, and this
     * entity's boolean field is {@code deleted} (its accessor is the conventional
     * {@code isDeleted()}, matching every other soft-delete entity in this codebase) — a derived
     * {@code ...IsDeletedFalse...} segment resolves to a non-existent "isDeleted" property and
     * fails at context startup with a {@code PropertyReferenceException}, exactly the trap this
     * codebase has already hit once before (see {@code QuestionCandidateRepository}'s history).
     */
    @Query("select c from AiContent c where c.question.id = :questionId and c.taskId = :taskId "
            + "and c.languageCode = :languageCode and c.deleted = false order by c.generatedAt desc")
    List<AiContent> findLiveForQuestion(@Param("questionId") UUID questionId,
                                         @Param("taskId") AiContentTask taskId,
                                         @Param("languageCode") String languageCode);

    @Query("select c from AiContent c where c.topic.id = :topicId and c.taskId = :taskId "
            + "and c.languageCode = :languageCode and c.deleted = false order by c.generatedAt desc")
    List<AiContent> findLiveForTopic(@Param("topicId") UUID topicId,
                                      @Param("taskId") AiContentTask taskId,
                                      @Param("languageCode") String languageCode);

    @Query("select c from AiContent c where c.contentStatus = :status and c.deleted = false "
            + "order by c.generatedAt asc")
    List<AiContent> findByContentStatus(@Param("status") ContentStatus status);

    @Query("select c from AiContent c where c.taskId = :taskId and c.contentStatus = :status "
            + "and c.deleted = false order by c.generatedAt asc")
    List<AiContent> findByTaskIdAndContentStatus(@Param("taskId") AiContentTask taskId,
                                                  @Param("status") ContentStatus status);

    /**
     * The sync read. {@code contentStatus = PUBLISHED} is intentionally NOT filtered here —
     * unlike {@code QuestionSpecifications.published()}, a row moving OUT of PUBLISHED (an
     * admin unpublishing a bad explanation) must still reach a device that already synced it, so
     * the client can drop it. The service layer is what decides whether a non-published row is a
     * tombstone from the client's point of view.
     */
    @Query("select c from AiContent c where c.updatedAt > :since order by c.updatedAt asc")
    List<AiContent> findByUpdatedAtAfter(@Param("since") OffsetDateTime since);
}
