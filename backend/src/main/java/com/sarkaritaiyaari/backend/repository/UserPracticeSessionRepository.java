package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.UserPracticeSession;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
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

    /**
     * Which of these ids already exist, and who owns each — the upload path's ownership check.
     *
     * <p>Returns {@code [id, userId]} pairs. Deliberately NOT scoped to one user: the upload has
     * to tell "this is my own retry" (merge) apart from "this id belongs to somebody else"
     * (reject) apart from "brand new" (persist), and a user-scoped query collapses the first two
     * of those into one answer. Reading another account's id here leaks nothing — only the fact
     * that the caller's own proposed id is already taken ever reaches the response.
     *
     * @see com.sarkaritaiyaari.backend.service.ProgressService#upload
     */
    @Query("select s.id, s.user.id from UserPracticeSession s where s.id in :ids")
    List<Object[]> findIdOwners(@Param("ids") Collection<String> ids);
}
