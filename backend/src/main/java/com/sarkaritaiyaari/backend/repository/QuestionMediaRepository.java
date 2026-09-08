package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.QuestionMedia;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface QuestionMediaRepository extends JpaRepository<QuestionMedia, UUID> {

    List<QuestionMedia> findByQuestionIdAndDeletedFalseOrderByDisplayOrderAsc(UUID questionId);

    List<QuestionMedia> findByQuestionGroupIdAndDeletedFalseOrderByDisplayOrderAsc(UUID questionGroupId);

    /** Batch fetch for a whole page of questions — see {@code QuestionService.mediaByQuestionId}. */
    List<QuestionMedia> findByQuestionIdInAndDeletedFalse(List<UUID> questionIds);
}
