package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.QuestionTranslation;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface QuestionTranslationRepository extends JpaRepository<QuestionTranslation, UUID> {

    Optional<QuestionTranslation> findByQuestionIdAndLanguageCode(UUID questionId, String languageCode);
}
