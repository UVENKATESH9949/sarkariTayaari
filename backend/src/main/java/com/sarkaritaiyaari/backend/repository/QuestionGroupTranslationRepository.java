package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.QuestionGroupTranslation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface QuestionGroupTranslationRepository extends JpaRepository<QuestionGroupTranslation, UUID> {

    Optional<QuestionGroupTranslation> findByQuestionGroupIdAndLanguageCode(UUID questionGroupId, String languageCode);

    List<QuestionGroupTranslation> findByQuestionGroupId(UUID questionGroupId);
}
