package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.QuestionType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface QuestionTypeRepository extends JpaRepository<QuestionType, String> {

    List<QuestionType> findAllByOrderByDisplayOrderAsc();
}
