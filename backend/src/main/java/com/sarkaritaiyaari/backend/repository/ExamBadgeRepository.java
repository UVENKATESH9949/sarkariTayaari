package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.ExamBadge;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ExamBadgeRepository extends JpaRepository<ExamBadge, String> {

    List<ExamBadge> findAllByOrderByDisplayOrderAsc();

    List<ExamBadge> findByActiveTrueOrderByDisplayOrderAsc();
}
