package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.ContentStatus;
import com.sarkaritaiyaari.backend.entity.RecruitmentCycle;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface RecruitmentCycleRepository extends JpaRepository<RecruitmentCycle, UUID> {

    List<RecruitmentCycle> findByExamCodeOrderByCreatedAtDesc(String examCode);

    Optional<RecruitmentCycle> findByExamCodeAndCurrentTrue(String examCode);

    /** The public/mobile-facing read (spec §36) — a draft cycle must behave as "no
     * current cycle configured" to anyone but an admin, same empty state as before this
     * feature existed. */
    Optional<RecruitmentCycle> findByExamCodeAndCurrentTrueAndContentStatus(String examCode, ContentStatus contentStatus);

    Optional<RecruitmentCycle> findByExamCodeAndCycleNameIgnoreCase(String examCode, String cycleName);

    /**
     * The mobile-facing read: every active exam's current, published cycle, in one query.
     * Deliberately fetch-joins only the exam, not importantDates/feeRules/etc — two
     * collection fetch-joins in one query is a {@code MultipleBagFetchException} even with
     * just two of them (hit this directly while building the endpoint), and even with Sets
     * it would multiply rows. The five child lists are left to load via
     * {@code hibernate.default_batch_fetch_size} instead, which turns them into a handful
     * of {@code WHERE recruitment_cycle_id IN (...)} batches — the exact same tradeoff
     * {@code ExamStageRepository.findStructuresForActiveExams} documents for the same reason.
     */
    @Query("""
            select distinct c from RecruitmentCycle c
            join fetch c.exam e
            where e.active = true and c.current = true and c.contentStatus = com.sarkaritaiyaari.backend.entity.ContentStatus.PUBLISHED
            order by e.displayOrder asc
            """)
    List<RecruitmentCycle> findCurrentCyclesForActiveExams();

    /**
     * Clears the previous current cycle for this exam before a new one is promoted —
     * paired with the {@code uq_recruitment_cycles_current} partial unique index so two
     * requests racing to promote different cycles fail on the constraint rather than
     * silently leaving two "current" rows.
     */
    @Modifying
    @Query("update RecruitmentCycle c set c.current = false where c.exam.code = :examCode and c.id != :exceptId")
    int clearCurrentForExam(@Param("examCode") String examCode, @Param("exceptId") UUID exceptId);
}
