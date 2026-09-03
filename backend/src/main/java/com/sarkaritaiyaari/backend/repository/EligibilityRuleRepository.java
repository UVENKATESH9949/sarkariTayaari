package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.EligibilityRule;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface EligibilityRuleRepository extends JpaRepository<EligibilityRule, UUID> {
}
