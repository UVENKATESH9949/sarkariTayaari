package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.Topic;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TopicRepository extends JpaRepository<Topic, UUID> {

    Optional<Topic> findBySubjectIdAndNameIgnoreCase(UUID subjectId, String name);

    List<Topic> findBySubjectId(UUID subjectId);

    List<Topic> findBySubjectIdOrderByDisplayOrderAscNameAsc(UUID subjectId);

    List<Topic> findAllByOrderByDisplayOrderAscNameAsc();

    /**
     * Removes every prerequisite edge touching this topic, in *both* directions — a topic
     * can be a prerequisite for others as well as have its own, and only clearing the
     * owning side would leave rows pointing at a topic that is about to be deleted.
     * Native because `topic_prerequisites` is a pure join table with no entity of its own.
     */
    @Modifying
    @Transactional
    @Query(value = "DELETE FROM topic_prerequisites WHERE topic_id = :topicId OR prerequisite_topic_id = :topicId",
            nativeQuery = true)
    void deletePrerequisiteEdges(@Param("topicId") UUID topicId);
}
