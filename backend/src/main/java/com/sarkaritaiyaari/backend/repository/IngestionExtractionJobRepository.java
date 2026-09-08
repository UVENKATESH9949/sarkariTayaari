package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.IngestionExtractionJob;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface IngestionExtractionJobRepository extends JpaRepository<IngestionExtractionJob, UUID> {

    List<IngestionExtractionJob> findByDocument_Id(UUID documentId);
}
