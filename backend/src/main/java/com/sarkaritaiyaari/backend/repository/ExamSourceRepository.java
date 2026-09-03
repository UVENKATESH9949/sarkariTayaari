package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.ExamSource;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface ExamSourceRepository extends JpaRepository<ExamSource, UUID> {
}
