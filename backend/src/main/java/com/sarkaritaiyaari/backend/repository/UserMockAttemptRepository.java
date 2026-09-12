package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.UserMockAttempt;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserMockAttemptRepository extends JpaRepository<UserMockAttempt, String> {

    List<UserMockAttempt> findByUserIdOrderByCompletedAtDesc(UUID userId);

    long countByUserId(UUID userId);

    /** Paged history list (TASK-2601 Phase 3) — ordering comes from the caller's Pageable, not baked in here. */
    Page<UserMockAttempt> findByUserId(UUID userId, Pageable pageable);

    /** Ownership-scoped single fetch — a wrong/missing id and someone else's id both resolve to empty, never distinguished. */
    Optional<UserMockAttempt> findByIdAndUserId(String id, UUID userId);
}
