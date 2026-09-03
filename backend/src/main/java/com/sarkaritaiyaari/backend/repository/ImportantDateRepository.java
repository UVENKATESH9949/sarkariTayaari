package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.ImportantDate;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ImportantDateRepository extends JpaRepository<ImportantDate, UUID> {

    List<ImportantDate> findByRecruitmentCycleIdOrderByDisplayOrderAsc(UUID recruitmentCycleId);
}
