package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.TopicTrend;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

public interface TopicTrendRepository extends JpaRepository<TopicTrend, String> {

    /**
     * Always scoped by algorithm version. A query that omitted it would silently mix rows
     * produced by different formulas into one ranking, which is precisely the failure mode
     * storing the version was meant to prevent.
     */
    @Query("select t from TopicTrend t join fetch t.topic tp join fetch tp.subject "
            + "where t.exam.code = :examCode and t.algorithmVersion = :version "
            + "order by t.appearanceCount desc, tp.name asc")
    List<TopicTrend> findForExamAndVersion(@Param("examCode") String examCode,
                                            @Param("version") String version);

    @Modifying
    @Transactional
    @Query("delete from TopicTrend t where t.exam.code = :examCode and t.algorithmVersion = :version")
    void deleteByExamCodeAndVersion(@Param("examCode") String examCode, @Param("version") String version);

    @Modifying
    @Transactional
    @Query("delete from TopicTrend t where t.exam.code = :examCode")
    void deleteByExamCode(@Param("examCode") String examCode);

    @Modifying
    @Transactional
    @Query("delete from TopicTrend t where t.topic.id = :topicId")
    void deleteByTopicId(@Param("topicId") UUID topicId);
}
