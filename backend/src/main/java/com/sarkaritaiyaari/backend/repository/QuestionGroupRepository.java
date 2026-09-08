package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.QuestionGroup;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.UUID;

public interface QuestionGroupRepository extends JpaRepository<QuestionGroup, UUID> {

    /** Same delta-sync shape as {@code QuestionRepository.findByUpdatedAtAfter} — groups sync on their own paged endpoint. */
    Page<QuestionGroup> findByUpdatedAtAfter(OffsetDateTime since, Pageable pageable);

    @Query("select count(q) from Question q where q.questionGroup.id = :groupId and q.deleted = false")
    long countNonDeletedQuestions(@Param("groupId") UUID groupId);
}
