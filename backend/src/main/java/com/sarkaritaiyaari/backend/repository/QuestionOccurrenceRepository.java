package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.QuestionOccurrence;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface QuestionOccurrenceRepository extends JpaRepository<QuestionOccurrence, UUID> {

    List<QuestionOccurrence> findByQuestion_IdOrderByCreatedAtAsc(UUID questionId);

    List<QuestionOccurrence> findByQuestion_IdIn(List<UUID> questionIds);

    void deleteByQuestion_IdAndLegacyDerivedTrue(UUID questionId);

    /** Used by the duplicate-merge (Phase 1) to move every occurrence from a merged-away question onto the survivor. */
    List<QuestionOccurrence> findByQuestion_Id(UUID questionId);
}
