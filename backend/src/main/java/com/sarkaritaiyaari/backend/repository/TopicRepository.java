package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.Topic;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface TopicRepository extends JpaRepository<Topic, UUID> {

    Optional<Topic> findBySubjectIdAndNameIgnoreCase(UUID subjectId, String name);

    List<Topic> findBySubjectId(UUID subjectId);

    List<Topic> findBySubjectIdOrderByDisplayOrderAscNameAsc(UUID subjectId);

    List<Topic> findAllByOrderByDisplayOrderAscNameAsc();
}
