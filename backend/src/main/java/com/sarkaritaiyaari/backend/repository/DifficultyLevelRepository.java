package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.DifficultyLevel;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface DifficultyLevelRepository extends JpaRepository<DifficultyLevel, String> {

    List<DifficultyLevel> findAllByOrderByDisplayOrderAsc();

    List<DifficultyLevel> findByActiveTrueOrderByDisplayOrderAsc();
}
