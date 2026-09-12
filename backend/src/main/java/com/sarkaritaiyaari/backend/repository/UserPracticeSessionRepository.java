package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.UserPracticeSession;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface UserPracticeSessionRepository extends JpaRepository<UserPracticeSession, String> {

    List<UserPracticeSession> findByUserIdOrderByCompletedAtDesc(UUID userId);

    long countByUserId(UUID userId);

    /** Paged history list (TASK-2601 Phase 3) — ordering comes from the caller's Pageable, not baked in here. */
    Page<UserPracticeSession> findByUserId(UUID userId, Pageable pageable);

    /** Ownership-scoped single fetch — a wrong/missing id and someone else's id both resolve to empty, never distinguished. */
    Optional<UserPracticeSession> findByIdAndUserId(String id, UUID userId);
}
