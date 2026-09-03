package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.ApplicationStep;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ApplicationStepRepository extends JpaRepository<ApplicationStep, UUID> {

    List<ApplicationStep> findByRecruitmentCycleIdOrderByStepNumberAsc(UUID recruitmentCycleId);
}
