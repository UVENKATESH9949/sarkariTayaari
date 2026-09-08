package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.IngestionAdminDtos.IngestionDocumentResponse;
import com.sarkaritaiyaari.backend.entity.IngestionDocument;
import com.sarkaritaiyaari.backend.entity.IngestionNotice;
import com.sarkaritaiyaari.backend.ingestion.DocumentStorage;
import com.sarkaritaiyaari.backend.repository.IngestionDocumentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * TASK-2401 Document 5/9/12 -- the "DocumentStore". Fetches a document, validates it's
 * really a PDF (Document 16 -- sniff magic bytes, never trust a header), dedups by
 * sha256, and either reuses an existing row or stores a new one (chained via
 * {@code supersedesDocument} when the same notice's attachment changed bytes -- Document
 * 42/10). Never deletes/overwrites an existing document.
 */
@Service
public class DocumentStoreService {

    private static final Logger log = LoggerFactory.getLogger(DocumentStoreService.class);
    private static final byte[] PDF_MAGIC = {'%', 'P', 'D', 'F'};

    private final IngestionDocumentRepository documentRepository;
    private final DocumentStorage documentStorage;

    public DocumentStoreService(IngestionDocumentRepository documentRepository,
                                 DocumentStorage documentStorage) {
        this.documentRepository = documentRepository;
        this.documentStorage = documentStorage;
    }

    /** {@code REQUIRES_NEW} is load-bearing, not a style choice: {@link NoticeDiscoveryService#scan}
     * calls this per-attachment as its own top-level, unnested call (scan() itself carries
     * no ambient transaction -- see that method's own doc comment) and catches any
     * exception so one bad document never fails the whole scan (Document 15). Kept
     * REQUIRES_NEW anyway, defensively, in case a future caller ever does wrap this in its
     * own transaction -- without it, the moment this method threw, Spring would mark that
     * caller's *shared* transaction rollback-only before its catch block ever ran, and its
     * own later commit would fail with {@code UnexpectedRollbackException} regardless of
     * the catch. Found (for {@link ExtractionJobService#processDocument}, which has the
     * exact same shape) by running the resilience test this behavior is meant to satisfy,
     * not by review -- see {@code NoticeDiscoveryTest.documentFetchFailure_doesNotFailTheNoticeOrTheScan}. */
    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public IngestionDocument store(String sourceUrl, IngestionNotice notice, byte[] bytes) {
        requireLooksLikePdf(bytes, sourceUrl);
        String hash = sha256Hex(bytes);

        Optional<IngestionDocument> existingByHash = documentRepository.findBySha256Hash(hash);
        if (existingByHash.isPresent()) {
            log.info("Document dedup hit for {}: sha256 {} already stored", sourceUrl, hash);
            return existingByHash.get();
        }

        IngestionDocument document = new IngestionDocument();
        document.setNotice(notice);
        document.setSourceUrl(sourceUrl);
        document.setSha256Hash(hash);
        document.setFileSizeBytes(bytes.length);
        document.setMimeType("application/pdf");
        document.setCreatedAt(OffsetDateTime.now());

        if (notice != null) {
            documentRepository.findFirstByNotice_IdOrderByCreatedAtDesc(notice.getId())
                    .ifPresent(document::setSupersedesDocument);
        }

        String storageUrl = documentStorage.upload(bytes, hash + ".pdf");
        document.setStorageUrl(storageUrl);

        return documentRepository.save(document);
    }

    @Transactional(readOnly = true)
    public List<IngestionDocumentResponse> listForNoticeIds(List<UUID> noticeIds) {
        if (noticeIds.isEmpty()) {
            return List.of();
        }
        return documentRepository.findByNotice_IdIn(noticeIds).stream()
                .map(DocumentStoreService::toResponse)
                .toList();
    }

    private static void requireLooksLikePdf(byte[] bytes, String sourceUrl) {
        if (bytes.length < PDF_MAGIC.length) {
            throw new IllegalArgumentException("Not a valid PDF (too short): " + sourceUrl);
        }
        for (int i = 0; i < PDF_MAGIC.length; i++) {
            if (bytes[i] != PDF_MAGIC[i]) {
                throw new IllegalArgumentException("Not a valid PDF (magic bytes mismatch): " + sourceUrl);
            }
        }
    }

    private static String sha256Hex(byte[] bytes) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(bytes);
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                hex.append(String.format("%02x", b));
            }
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 not available", e);
        }
    }

    static IngestionDocumentResponse toResponse(IngestionDocument document) {
        return new IngestionDocumentResponse(
                document.getId(),
                document.getNotice() != null ? document.getNotice().getId() : null,
                document.getSourceUrl(),
                document.getStorageUrl(),
                document.getSha256Hash(),
                document.getFileSizeBytes(),
                document.getMimeType(),
                document.getPageCount(),
                document.getIsTextExtractable(),
                document.getSupersedesDocument() != null ? document.getSupersedesDocument().getId() : null,
                document.getCreatedAt());
    }
}
