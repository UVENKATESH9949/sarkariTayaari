package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.UserPracticeSession;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface UserPracticeSessionRepository extends JpaRepository<UserPracticeSession, String> {

    List<UserPracticeSession> findByUserIdOrderByCompletedAtDesc(UUID userId);

    long countByUserId(UUID userId);
}
