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
     * Version-aware duplicate check (TICKET-2108).
     *
     * <p>Replaces {@link #findByExamCodeAndNameIgnoreCase} as the create/update guard. That
     * method rejected any second stage sharing a name, which is the code-level twin of the
     * {@code UNIQUE (exam_code, name)} constraint V16 relaxes - leaving it in place would have
     * made the migration pointless, since the service would still refuse the write.
     *
     * <p>{@code coalesce} mirrors the unique index exactly: two null version labels are the
     * same version ("un-versioned"), not two distinct ones.
     */
    @Query("""
            select s from ExamStage s
            where s.exam.code = :examCode
              and lower(s.name) = lower(:name)
              and coalesce(s.versionLabel, '') = coalesce(:versionLabel, '')
            """)
    Optional<ExamStage> findByExamCodeNameAndVersion(@Param("examCode") String examCode,
                                                      @Param("name") String name,
                                                      @Param("versionLabel") String versionLabel);

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
