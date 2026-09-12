package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.AiTaskFlag;
import com.sarkaritaiyaari.backend.entity.AiTaskId;
import org.springframework.data.jpa.repository.JpaRepository;

public interface AiTaskFlagRepository extends JpaRepository<AiTaskFlag, AiTaskId> {
}
