package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.FollowedExam;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface FollowedExamRepository extends JpaRepository<FollowedExam, String> {

    List<FollowedExam> findByUserIdAndDeletedFalse(UUID userId);
}
