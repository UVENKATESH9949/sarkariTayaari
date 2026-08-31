package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.QuestionDuplicate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

public interface QuestionDuplicateRepository
        extends JpaRepository<QuestionDuplicate, QuestionDuplicate.Key> {

    /** The admin review queue — oldest detection first, so nothing sits forever. */
    @Query("select d from QuestionDuplicate d where d.resolvedAt is null order by d.detectedAt asc")
    Page<QuestionDuplicate> findUnresolved(Pageable pageable);

    @Query("select count(d) from QuestionDuplicate d where d.resolvedAt is null")
    long countUnresolved();

    /**
     * Both directions. A pair may have been recorded either way round depending on which
     * row was imported first, and an admin looking at one question needs to see the pairing
     * regardless of which side of it this question sits on.
     */
    @Query("select d from QuestionDuplicate d "
            + "where d.questionId = :questionId or d.duplicateOfQuestionId = :questionId")
    List<QuestionDuplicate> findAllInvolving(@Param("questionId") UUID questionId);

    /**
     * Explicit query + @Transactional rather than a derived delete — same
     * TransactionRequiredException trap as ExamTopicRepository.deleteByExamCode. Needed by
     * test teardown, which is non-transactional.
     */
    @Modifying
    @Transactional
    @Query("delete from QuestionDuplicate d "
            + "where d.questionId in :ids or d.duplicateOfQuestionId in :ids")
    void deleteAllInvolving(@Param("ids") List<UUID> ids);
}
