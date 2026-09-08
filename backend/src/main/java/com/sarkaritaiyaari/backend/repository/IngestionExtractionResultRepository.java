package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.IngestionExtractionResult;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface IngestionExtractionResultRepository extends JpaRepository<IngestionExtractionResult, UUID> {

    List<IngestionExtractionResult> findByExtractionJob_Id(UUID extractionJobId);

    List<IngestionExtractionResult> findByExtractionJob_Document_IdIn(List<UUID> documentIds);
}
