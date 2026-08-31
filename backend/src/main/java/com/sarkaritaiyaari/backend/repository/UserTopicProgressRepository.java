package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.UserTopicProgress;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

public interface UserTopicProgressRepository extends JpaRepository<UserTopicProgress, String> {

    /**
     * The restore path. Joins topic and subject eagerly because every consumer needs the
     * topic's name and its subject — without the fetch this is a textbook 1+N over however
     * many topics the student has touched, on a request that runs at every fresh install.
     */
    @Query("select p from UserTopicProgress p join fetch p.topic t join fetch t.subject "
            + "where p.user.id = :userId")
    List<UserTopicProgress> findAllForUser(@Param("userId") UUID userId);

    /**
     * Explicit query with its own @Transactional rather than a derived delete, for the same
     * reason as {@link ExamTopicRepository#deleteByExamCode} — SimpleJpaRepository only
     * wraps its own CRUD methods, so a derived delete from a non-transactional caller (a
     * test teardown) fails with TransactionRequiredException.
     */
    @Modifying
    @Transactional
    @Query("delete from UserTopicProgress p where p.user.id = :userId")
    void deleteByUserId(@Param("userId") UUID userId);

    @Modifying
    @Transactional
    @Query("delete from UserTopicProgress p where p.topic.id = :topicId")
    void deleteByTopicId(@Param("topicId") UUID topicId);
}
