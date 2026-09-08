package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.IngestionAdminDtos.IngestionDocumentResponse;
import com.sarkaritaiyaari.backend.dto.IngestionAdminDtos.IngestionExtractionResultResponse;
import com.sarkaritaiyaari.backend.dto.IngestionAdminDtos.IngestionNoticeResponse;
import com.sarkaritaiyaari.backend.dto.IngestionAdminDtos.ScanResult;
import com.sarkaritaiyaari.backend.entity.IngestionDocument;
import com.sarkaritaiyaari.backend.entity.IngestionExtractionResult;
import com.sarkaritaiyaari.backend.entity.IngestionNotice;
import com.sarkaritaiyaari.backend.entity.IngestionSource;
import com.sarkaritaiyaari.backend.ingestion.DiscoveredNotice;
import com.sarkaritaiyaari.backend.ingestion.DocumentFetcher;
import com.sarkaritaiyaari.backend.ingestion.NoticeSourceAdapter;
import com.sarkaritaiyaari.backend.repository.IngestionExtractionResultRepository;
import com.sarkaritaiyaari.backend.repository.IngestionNoticeRepository;
import com.sarkaritaiyaari.backend.repository.IngestionSourceRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * TASK-2401 Document 2's discovery step. Resolves a source's adapter, diffs what it
 * returns against what's already known, and upserts {@code ingestion_notices} rows --
 * never deletes one, only sets {@code removedAt}, per Document 9/11's "nothing is
 * silently overwritten" principle.
 *
 * <p>As of Task 4/5, a CREATE/UPDATE notice's attachments are also fetched, stored, and
 * text-extracted -- but only for CREATE/UPDATE, never UNCHANGED, so a repeat scan of a
 * notice whose content hasn't changed doesn't re-download its PDF from the real source
 * every time. Fetch/store/extract are three separate top-level calls, deliberately not
 * chained inside one convenience method: each needs its own transaction to see the
 * previous step's result already committed (see {@link #scan}'s own doc comment). Per
 * Document 15's reliability table, a failure at any of the three never fails the notice's
 * own discovery or the rest of the scan -- it's simply retried on the next scan.
 */
@Service
public class NoticeDiscoveryService {

    private static final Logger log = LoggerFactory.getLogger(NoticeDiscoveryService.class);

    private final IngestionSourceRepository sourceRepository;
    private final IngestionNoticeRepository noticeRepository;
    private final Map<String, NoticeSourceAdapter> adaptersByParserKey;
    private final DocumentFetcher documentFetcher;
    private final DocumentStoreService documentStoreService;
    private final ExtractionJobService extractionJobService;
    private final IngestionExtractionResultRepository extractionResultRepository;

    public NoticeDiscoveryService(IngestionSourceRepository sourceRepository,
                                   IngestionNoticeRepository noticeRepository,
                                   Map<String, NoticeSourceAdapter> adaptersByParserKey,
                                   DocumentFetcher documentFetcher,
                                   DocumentStoreService documentStoreService,
                                   ExtractionJobService extractionJobService,
                                   IngestionExtractionResultRepository extractionResultRepository) {
        this.sourceRepository = sourceRepository;
        this.noticeRepository = noticeRepository;
        this.adaptersByParserKey = adaptersByParserKey;
        this.documentFetcher = documentFetcher;
        this.documentStoreService = documentStoreService;
        this.extractionResultRepository = extractionResultRepository;
        this.extractionJobService = extractionJobService;
    }

    /** Deliberately NOT wrapped in one big {@code @Transactional}: each
     * {@code noticeRepository.save(...)} below already commits on its own (Spring Data's
     * own per-call transaction), and {@link DocumentStoreService#store}/
     * {@link ExtractionJobService#processDocument} each need their own transaction to see
     * the previous step's row already committed -- an outer transaction here would still
     * be holding that INSERT open, and the next step's transaction (on a different DB
     * connection) would hit a foreign-key violation trying to reference a row that, from
     * its point of view, doesn't exist yet. A half-completed scan is an accepted,
     * retried-next-time outcome here, matching Document 15's own "partial completion is
     * normal" stance elsewhere in this pipeline. */
    public ScanResult scan(UUID sourceId) {
        IngestionSource source = sourceRepository.findById(sourceId)
                .orElseThrow(() -> new NoSuchElementException("Ingestion source not found: " + sourceId));

        NoticeSourceAdapter adapter = adaptersByParserKey.get(source.getParserKey());
        if (adapter == null) {
            throw new IllegalStateException("No adapter registered for parser key: " + source.getParserKey());
        }

        OffsetDateTime now = OffsetDateTime.now();
        List<DiscoveredNotice> discovered;
        try {
            discovered = adapter.listNotices(source);
        } catch (RuntimeException e) {
            source.setLastCheckedAt(now);
            source.setLastFailureAt(now);
            source.setConsecutiveFailures(source.getConsecutiveFailures() + 1);
            sourceRepository.save(source);
            log.warn("Scan failed for ingestion source {} ({})", source.getName(), source.getId(), e);
            throw new IllegalStateException("Scan failed for source " + source.getName() + ": " + e.getMessage(), e);
        }

        List<IngestionNotice> existingActive = noticeRepository.findBySource_IdAndRemovedAtIsNull(sourceId);
        Map<String, IngestionNotice> byExternalRef = new HashMap<>();
        Map<String, IngestionNotice> byContentHash = new HashMap<>();
        for (IngestionNotice existing : existingActive) {
            if (existing.getExternalRef() != null) {
                byExternalRef.put(existing.getExternalRef(), existing);
            } else {
                byContentHash.put(existing.getContentHash(), existing);
            }
        }

        Set<UUID> matchedIds = new HashSet<>();
        // Notices worth fetching a document for -- CREATE/UPDATE only (see class doc).
        Map<IngestionNotice, List<String>> noticesNeedingDocuments = new HashMap<>();
        int created = 0;
        int updated = 0;
        int unchanged = 0;

        for (DiscoveredNotice d : discovered) {
            String contentHash = contentHash(d);
            IngestionNotice existing = d.externalRef() != null
                    ? byExternalRef.get(d.externalRef())
                    : byContentHash.get(contentHash);

            if (existing == null) {
                IngestionNotice notice = new IngestionNotice();
                notice.setSource(source);
                notice.setExternalRef(d.externalRef());
                notice.setTitle(d.title());
                notice.setNoticeUrl(d.noticeUrl());
                notice.setContentHash(contentHash);
                notice.setPublishedAt(d.publishedAt());
                notice.setFirstSeenAt(now);
                notice.setLastSeenAt(now);
                noticeRepository.save(notice);
                matchedIds.add(notice.getId());
                created++;
                if (!d.attachmentUrls().isEmpty()) {
                    noticesNeedingDocuments.put(notice, d.attachmentUrls());
                }
            } else {
                matchedIds.add(existing.getId());
                existing.setLastSeenAt(now);
                if (!contentHash.equals(existing.getContentHash())) {
                    existing.setTitle(d.title());
                    existing.setNoticeUrl(d.noticeUrl());
                    existing.setContentHash(contentHash);
                    existing.setPublishedAt(d.publishedAt());
                    updated++;
                    if (!d.attachmentUrls().isEmpty()) {
                        noticesNeedingDocuments.put(existing, d.attachmentUrls());
                    }
                } else {
                    unchanged++;
                }
                noticeRepository.save(existing);
            }
        }

        int removed = 0;
        for (IngestionNotice existing : existingActive) {
            if (!matchedIds.contains(existing.getId())) {
                existing.setRemovedAt(now);
                noticeRepository.save(existing);
                removed++;
            }
        }

        source.setLastCheckedAt(now);
        source.setLastSuccessAt(now);
        source.setConsecutiveFailures(0);
        sourceRepository.save(source);

        for (Map.Entry<IngestionNotice, List<String>> entry : noticesNeedingDocuments.entrySet()) {
            for (String attachmentUrl : entry.getValue()) {
                try {
                    // Three separate top-level calls, not a chained convenience method --
                    // see this method's own doc comment for why that matters.
                    byte[] bytes = documentFetcher.fetch(attachmentUrl);
                    IngestionDocument document = documentStoreService.store(attachmentUrl, entry.getKey(), bytes);
                    extractionJobService.processDocument(document, bytes);
                } catch (RuntimeException e) {
                    // Document 15: a failed fetch/store/extraction never fails the notice
                    // or the scan -- retried next scan (a fetch/store failure leaves no
                    // ingestion_documents row at all; an extraction failure leaves one, but
                    // with a FAILED job, which a later task's reaper can retry).
                    log.warn("Document processing failed for notice {} ({}): {}",
                            entry.getKey().getId(), attachmentUrl, e.getMessage());
                }
            }
        }

        log.info("Scan complete for {}: {} discovered, {} created, {} updated, {} unchanged, {} removed",
                source.getName(), discovered.size(), created, updated, unchanged, removed);
        return new ScanResult(discovered.size(), created, updated, unchanged, removed);
    }

    @Transactional(readOnly = true)
    public List<IngestionNoticeResponse> listNotices(UUID sourceId, String status) {
        List<IngestionNotice> notices = "ALL".equalsIgnoreCase(status)
                ? noticeRepository.findBySource_Id(sourceId)
                : "REMOVED".equalsIgnoreCase(status)
                        ? noticeRepository.findBySource_Id(sourceId).stream().filter(n -> n.getRemovedAt() != null).toList()
                        : noticeRepository.findBySource_IdAndRemovedAtIsNull(sourceId);

        // One batched query for every notice's most-recent document, not one query per
        // row -- the N+1 shape this codebase has already fixed as a real perf bug before.
        Map<UUID, String> documentUrlByNoticeId = documentStoreService
                .listForNoticeIds(notices.stream().map(IngestionNotice::getId).toList()).stream()
                .collect(Collectors.toMap(
                        IngestionDocumentResponse::noticeId,
                        IngestionDocumentResponse::storageUrl,
                        (a, b) -> b));

        return notices.stream()
                .sorted(Comparator.comparing(IngestionNotice::getLastSeenAt).reversed())
                .map(notice -> toResponse(notice, documentUrlByNoticeId.get(notice.getId())))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<IngestionDocumentResponse> listDocuments(UUID sourceId) {
        List<UUID> noticeIds = noticeRepository.findBySource_Id(sourceId).stream().map(IngestionNotice::getId).toList();
        return documentStoreService.listForNoticeIds(noticeIds);
    }

    /** TASK-2401 Task 6 -- every extraction candidate produced for any document under this
     * source's notices, most recent first. Read-only visibility; Accept/Reject actions
     * are Task 8's review-queue endpoints, not built yet. */
    @Transactional(readOnly = true)
    public List<IngestionExtractionResultResponse> listExtractionResults(UUID sourceId) {
        List<UUID> noticeIds = noticeRepository.findBySource_Id(sourceId).stream().map(IngestionNotice::getId).toList();
        if (noticeIds.isEmpty()) {
            return List.of();
        }
        List<UUID> documentIds = documentStoreService.listForNoticeIds(noticeIds).stream()
                .map(IngestionDocumentResponse::id)
                .toList();
        if (documentIds.isEmpty()) {
            return List.of();
        }
        return extractionResultRepository.findByExtractionJob_Document_IdIn(documentIds).stream()
                .sorted(Comparator.comparing(IngestionExtractionResult::getCreatedAt).reversed())
                .map(NoticeDiscoveryService::toExtractionResultResponse)
                .toList();
    }

    /** Package-visible: also reused by {@link ReviewQueueService}, so both places that
     * map this entity to its response DTO agree on the shape. */
    static IngestionExtractionResultResponse toExtractionResultResponse(IngestionExtractionResult result) {
        return new IngestionExtractionResultResponse(
                result.getId(),
                result.getExtractionJob().getId(),
                result.getExtractionJob().getDocument().getId(),
                result.getTargetType().name(),
                result.getOperation().name(),
                result.getTargetId(),
                result.getPayload(),
                result.getExtractionMethod().name(),
                result.getConfidence().name(),
                result.getSourceExcerpt(),
                result.getValidationWarnings(),
                result.getReviewStatus().name(),
                result.getRejectionReason(),
                result.getAppliedRecruitmentCycleId(),
                result.getReviewedAt(),
                result.getCreatedAt());
    }

    private static IngestionNoticeResponse toResponse(IngestionNotice notice, String documentUrl) {
        return new IngestionNoticeResponse(
                notice.getId(),
                notice.getSource().getId(),
                notice.getExternalRef(),
                notice.getTitle(),
                notice.getNoticeUrl(),
                notice.getPublishedAt(),
                notice.getFirstSeenAt(),
                notice.getLastSeenAt(),
                notice.getRemovedAt(),
                documentUrl);
    }

    private static String contentHash(DiscoveredNotice d) {
        String raw = (d.title() == null ? "" : d.title())
                + "|" + (d.noticeUrl() == null ? "" : d.noticeUrl())
                + "|" + (d.publishedAt() == null ? "" : d.publishedAt().toString());
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(raw.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }
}
