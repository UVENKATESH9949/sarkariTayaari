package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.QuestionRawExtraction;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface QuestionRawExtractionRepository extends JpaRepository<QuestionRawExtraction, UUID> {

    List<QuestionRawExtraction> findByDocument_Id(UUID documentId);

    Optional<QuestionRawExtraction> findByDocument_IdAndExtractorVersionAndPositionInDocument(
            UUID documentId, String extractorVersion, int positionInDocument);
}
