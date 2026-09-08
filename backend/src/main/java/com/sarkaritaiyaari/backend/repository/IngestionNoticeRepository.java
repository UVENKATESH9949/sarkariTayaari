package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.IngestionNotice;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface IngestionNoticeRepository extends JpaRepository<IngestionNotice, UUID> {

    List<IngestionNotice> findBySource_IdAndRemovedAtIsNull(UUID sourceId);

    List<IngestionNotice> findBySource_Id(UUID sourceId);
}
