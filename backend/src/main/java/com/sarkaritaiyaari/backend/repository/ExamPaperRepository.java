package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.ExamPaper;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ExamPaperRepository extends JpaRepository<ExamPaper, UUID> {

    List<ExamPaper> findByStageIdOrderByDisplayOrderAsc(UUID stageId);

    Optional<ExamPaper> findByStageIdAndNameIgnoreCase(UUID stageId, String name);
}
