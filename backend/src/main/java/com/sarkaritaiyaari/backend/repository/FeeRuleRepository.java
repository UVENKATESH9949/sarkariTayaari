package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.FeeRule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface FeeRuleRepository extends JpaRepository<FeeRule, UUID> {

    List<FeeRule> findByRecruitmentCycleIdOrderByDisplayOrderAsc(UUID recruitmentCycleId);
}
