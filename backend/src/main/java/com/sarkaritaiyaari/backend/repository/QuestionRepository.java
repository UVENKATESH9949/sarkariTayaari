package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.Question;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.OffsetDateTime;
import java.util.UUID;

public interface QuestionRepository extends JpaRepository<Question, UUID>, JpaSpecificationExecutor<Question>,
        QuestionRepositoryCustom {

    // topic/subject are *-to-one, so joining them here is safe with pagination (no
    // row multiplication). exams/translations are *-to-many and stay lazy, handled
    // by hibernate.default_batch_fetch_size instead — a JOIN FETCH on those would
    // multiply rows per page and break LIMIT/OFFSET-based pagination.
    @Query(
            value = "SELECT q FROM Question q JOIN FETCH q.topic t JOIN FETCH t.subject WHERE q.updatedAt > :since",
            countQuery = "SELECT count(q) FROM Question q WHERE q.updatedAt > :since"
    )
    Page<Question> findByUpdatedAtAfter(@Param("since") OffsetDateTime since, Pageable pageable);
}
