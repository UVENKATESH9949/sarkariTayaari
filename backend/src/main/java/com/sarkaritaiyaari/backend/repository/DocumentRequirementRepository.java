package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.DocumentRequirement;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface DocumentRequirementRepository extends JpaRepository<DocumentRequirement, UUID> {

    List<DocumentRequirement> findByRecruitmentCycleIdOrderByDisplayOrderAsc(UUID recruitmentCycleId);
}
