package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.ExtractionReviewStatus;
import com.sarkaritaiyaari.backend.entity.QuestionCandidate;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface QuestionCandidateRepository extends JpaRepository<QuestionCandidate, UUID> {

    Optional<QuestionCandidate> findByRawExtraction_Id(UUID rawExtractionId);

    @Query("select c from QuestionCandidate c where c.rawExtraction.document.id = :documentId order by c.createdAt asc")
    List<QuestionCandidate> findByDocumentId(@Param("documentId") UUID documentId);

    @Query("select c from QuestionCandidate c where c.rawExtraction.document.id = :documentId "
            + "and c.status = :status order by c.createdAt asc")
    List<QuestionCandidate> findByDocumentIdAndStatus(@Param("documentId") UUID documentId,
                                                        @Param("status") ExtractionReviewStatus status);
}
