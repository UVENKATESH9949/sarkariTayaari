package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.ApplicationMistake;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ApplicationMistakeRepository extends JpaRepository<ApplicationMistake, UUID> {

    List<ApplicationMistake> findByRecruitmentCycleIdOrderByDisplayOrderAsc(UUID recruitmentCycleId);
}
