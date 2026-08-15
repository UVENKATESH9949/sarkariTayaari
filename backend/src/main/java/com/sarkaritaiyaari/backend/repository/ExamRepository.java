package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.Exam;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ExamRepository extends JpaRepository<Exam, String> {

    List<Exam> findAllByOrderByDisplayOrderAsc();
}
