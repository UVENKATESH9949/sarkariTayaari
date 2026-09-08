package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.IngestionSource;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface IngestionSourceRepository extends JpaRepository<IngestionSource, UUID> {
}
