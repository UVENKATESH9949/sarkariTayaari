package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.UserPracticeSessionResult;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.UUID;

/**
 * TASK-2601 Phase 3 — Revise's "Wrong Answers" tab (web has no local database to flatten
 * this from, unlike mobile's {@code mobile/src/practice/wrongAnswers.ts}). An explicit
 * {@code @Query} rather than a derived name, per this codebase's own stated preference for
 * anything non-trivial (see the {@code isDeleted}-vs-{@code deleted} trap already documented
 * elsewhere in this project) — a derived name spanning two joined entities and a boolean
 * comparison is exactly the shape that trap comes from.
 */
public interface UserPracticeSessionResultRepository extends JpaRepository<UserPracticeSessionResult, String> {

    @Query("""
            select r from UserPracticeSessionResult r
            where r.session.user.id = :userId and r.correct = false
            order by r.session.completedAt desc, r.orderIndex desc
            """)
    Page<UserPracticeSessionResult> findWrongAnswers(@Param("userId") UUID userId, Pageable pageable);
}
