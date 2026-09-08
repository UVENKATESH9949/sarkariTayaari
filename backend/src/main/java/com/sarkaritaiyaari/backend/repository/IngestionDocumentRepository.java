package com.sarkaritaiyaari.backend.repository;

import com.sarkaritaiyaari.backend.entity.IngestionDocument;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface IngestionDocumentRepository extends JpaRepository<IngestionDocument, UUID> {

    Optional<IngestionDocument> findBySha256Hash(String sha256Hash);

    Optional<IngestionDocument> findFirstByNotice_IdOrderByCreatedAtDesc(UUID noticeId);

    /** Batched lookup, not one query per notice -- avoids the N+1 shape this codebase has
     * already fixed as a real perf bug more than once. */
    List<IngestionDocument> findByNotice_IdIn(List<UUID> noticeIds);

    /**
     * TASK-2501 Phase 2 -- every document the question-ingestion pipeline stored. A
     * null {@code notice} uniquely identifies one: TASK-2401's own path always supplies a
     * real notice (a document is only ever fetched there as one notice's attachment), so
     * "no notice" is a safe, no-new-column differentiator for the sibling pipeline.
     */
    List<IngestionDocument> findByNoticeIsNullOrderByCreatedAtDesc();
}
