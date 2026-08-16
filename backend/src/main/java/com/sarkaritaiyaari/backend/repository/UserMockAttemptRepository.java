package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.UserMockAttempt;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface UserMockAttemptRepository extends JpaRepository<UserMockAttempt, String> {

    List<UserMockAttempt> findByUserIdOrderByCompletedAtDesc(UUID userId);

    long countByUserId(UUID userId);
}
