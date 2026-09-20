package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.StudyTask;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * The persisted daily assignment (TASK-3301, V49).
 *
 * <p>Explicit JPQL rather than derived names: this codebase has been bitten three times by a
 * derived query name resolving against an accessor rather than a field, and a name spanning a
 * joined user plus a date plus an exam code is exactly that shape.
 */
public interface StudyTaskRepository extends JpaRepository<StudyTask, UUID> {

    /** One student's plan for one day and exam, in the order it was assigned. */
    @Query("""
            select t from StudyTask t
            where t.userId = :userId and t.planDate = :planDate and t.examCode = :examCode
            order by t.displayOrder asc
            """)
    List<StudyTask> findForDay(@Param("userId") UUID userId,
                               @Param("planDate") LocalDate planDate,
                               @Param("examCode") String examCode);

    /**
     * Tasks from days already over that nobody has settled yet (TASK-3401). Bounded to a few days
     * back rather than all history: a student returning after a month should not trigger a scan of
     * every plan they were ever given, and an unsettled task from six weeks ago tells Phase 6
     * nothing it can still act on.
     */
    @Query("""
            select t from StudyTask t
            where t.userId = :userId and t.status = 'ASSIGNED'
              and t.planDate < :today and t.planDate >= :since
            order by t.planDate asc, t.displayOrder asc
            """)
    List<StudyTask> findUnsettledBefore(@Param("userId") UUID userId,
                                        @Param("today") LocalDate today,
                                        @Param("since") LocalDate since);
}
