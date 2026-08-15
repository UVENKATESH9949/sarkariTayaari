package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.ExamStage;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ExamStageRepository extends JpaRepository<ExamStage, UUID> {

    List<ExamStage> findByExamCodeOrderByDisplayOrderAsc(String examCode);

    Optional<ExamStage> findByExamCodeAndNameIgnoreCase(String examCode, String name);

    /**
     * Reads a whole exam's structure. Papers are join-fetched here; sections and their
     * subjects are left to load via `hibernate.default_batch_fetch_size`, which turns
     * them into a couple of `WHERE id IN (...)` batches instead of one query per row.
     *
     * Deliberately not join-fetching sections as well: two collection fetch-joins in one
     * query is a MultipleBagFetchException, and even with Sets it would multiply rows.
     * This keeps the whole tree at a small, constant number of queries.
     */
    @Query("""
            select distinct s from ExamStage s
            left join fetch s.papers p
            left join fetch p.paperType
            where s.exam.code = :examCode
            order by s.displayOrder asc
            """)
    List<ExamStage> findStructureByExamCode(@Param("examCode") String examCode);

    /**
     * Every active exam's structure in one query, so the mobile client syncs the whole
     * set in a single request rather than one per exam. Same fetch strategy as above.
     */
    @Query("""
            select distinct s from ExamStage s
            join fetch s.exam e
            left join fetch s.papers p
            left join fetch p.paperType
            where e.active = true
            order by e.displayOrder asc, s.displayOrder asc
            """)
    List<ExamStage> findStructuresForActiveExams();
}
