package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.LessonBlueprint;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface LessonBlueprintRepository extends JpaRepository<LessonBlueprint, UUID> {

    Optional<LessonBlueprint> findByIdAndDeletedFalse(UUID id);

    List<LessonBlueprint> findAllByDeletedFalseOrderByCreatedAtDesc();

    List<LessonBlueprint> findAllByTopicIdAndDeletedFalseOrderByCreatedAtDesc(UUID topicId);

    List<LessonBlueprint> findAllByQuestionIdAndDeletedFalseOrderByCreatedAtDesc(UUID questionId);

    Optional<LessonBlueprint> findFirstByStudioLessonIdAndDeletedFalse(String studioLessonId);
}
