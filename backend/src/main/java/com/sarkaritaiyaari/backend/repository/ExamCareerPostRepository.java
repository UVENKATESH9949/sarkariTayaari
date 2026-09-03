package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.ExamCareerPost;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface ExamCareerPostRepository extends JpaRepository<ExamCareerPost, UUID> {

    List<ExamCareerPost> findByExamCodeOrderByDisplayOrderAsc(String examCode);
}
