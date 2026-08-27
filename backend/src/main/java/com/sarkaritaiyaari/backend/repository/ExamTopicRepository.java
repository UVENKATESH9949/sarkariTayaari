package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.ExamTopic;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

public interface ExamTopicRepository extends JpaRepository<ExamTopic, String> {

    List<ExamTopic> findByExamCodeOrderByTopicName(String examCode);

    List<ExamTopic> findByTopicId(UUID topicId);

    /**
     * Explicit query with its own @Transactional rather than a derived `deleteByExamCode`.
     * SimpleJpaRepository only wraps its own CRUD methods in a transaction, so a derived
     * delete called from a non-transactional caller (a test teardown, for instance) fails
     * with TransactionRequiredException. Found exactly that way.
     */
    @Modifying
    @Transactional
    @Query("delete from ExamTopic et where et.exam.code = :examCode")
    void deleteByExamCode(@Param("examCode") String examCode);
}
