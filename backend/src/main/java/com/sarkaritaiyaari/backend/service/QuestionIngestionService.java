package com.sarkaritaiyaari.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sarkaritaiyaari.backend.dto.CreateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.QuestionIngestionDtos.IngestSummary;
import com.sarkaritaiyaari.backend.dto.QuestionIngestionDtos.IngestedDocumentResponse;
import com.sarkaritaiyaari.backend.dto.QuestionIngestionDtos.QuestionCandidateResponse;
import com.sarkaritaiyaari.backend.dto.QuestionResponse;
import com.sarkaritaiyaari.backend.entity.ContentStatus;
import com.sarkaritaiyaari.backend.entity.ExtractionConfidence;
import com.sarkaritaiyaari.backend.entity.ExtractionReviewStatus;
import com.sarkaritaiyaari.backend.entity.IngestionDocument;
import com.sarkaritaiyaari.backend.entity.QuestionCandidate;
import com.sarkaritaiyaari.backend.entity.QuestionOccurrence;
import com.sarkaritaiyaari.backend.entity.QuestionRawExtraction;
import com.sarkaritaiyaari.backend.ingestion.DocumentFetcher;
import com.sarkaritaiyaari.backend.ingestion.PdfTextExtractor;
import com.sarkaritaiyaari.backend.ingestion.QuestionRawExtractor;
import com.sarkaritaiyaari.backend.ingestion.QuestionRawExtractor.RawQuestionBlock;
import com.sarkaritaiyaari.backend.repository.IngestionDocumentRepository;
import com.sarkaritaiyaari.backend.repository.QuestionCandidateRepository;
import com.sarkaritaiyaari.backend.repository.QuestionOccurrenceRepository;
import com.sarkaritaiyaari.backend.repository.QuestionRawExtractionRepository;
import com.sarkaritaiyaari.backend.repository.QuestionRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.UUID;

/**
 * TASK-2501 Phase 2 -- the orchestrator. Turns an admin-supplied source URL into staged,
 * reviewable {@code question_candidates}, and turns an Accept into a real {@code questions}
 * row through the exact same {@code QuestionService.create()} a hand-typed question already
 * goes through — matching TASK-2401's own "indistinguishable from hand-typed" principle for
 * its sibling pipeline.
 *
 * <p>No AI anywhere in this class (Phase 2's own scope) — {@link QuestionRawExtractor} and
 * {@code QuestionCandidateBuilder} (used by {@link QuestionCandidateStagingService}) are
 * both deterministic. Everything routes to a real {@code QuestionCandidate} row a reviewer
 * must act on; nothing is auto-published.
 */
@Service
public class QuestionIngestionService {

    private static final Logger log = LoggerFactory.getLogger(QuestionIngestionService.class);
    private static final String EXTRACTOR_VERSION = "v1";

    private final DocumentFetcher documentFetcher;
    private final DocumentStoreService documentStoreService;
    private final PdfTextExtractor pdfTextExtractor;
    private final QuestionRawExtractor questionRawExtractor;
    private final QuestionCandidateStagingService stagingService;
    private final QuestionRawExtractionRepository rawExtractionRepository;
    private final QuestionCandidateRepository candidateRepository;
    private final IngestionDocumentRepository ingestionDocumentRepository;
    private final QuestionOccurrenceRepository occurrenceRepository;
    private final QuestionRepository questionRepository;
    private final QuestionService questionService;
    private final ObjectMapper objectMapper;

    public QuestionIngestionService(DocumentFetcher documentFetcher,
                                     DocumentStoreService documentStoreService,
                                     PdfTextExtractor pdfTextExtractor,
                                     QuestionRawExtractor questionRawExtractor,
                                     QuestionCandidateStagingService stagingService,
                                     QuestionRawExtractionRepository rawExtractionRepository,
                                     QuestionCandidateRepository candidateRepository,
                                     IngestionDocumentRepository ingestionDocumentRepository,
                                     QuestionOccurrenceRepository occurrenceRepository,
                                     QuestionRepository questionRepository,
                                     QuestionService questionService,
                                     ObjectMapper objectMapper) {
        this.documentFetcher = documentFetcher;
        this.documentStoreService = documentStoreService;
        this.pdfTextExtractor = pdfTextExtractor;
        this.questionRawExtractor = questionRawExtractor;
        this.stagingService = stagingService;
        this.rawExtractionRepository = rawExtractionRepository;
        this.candidateRepository = candidateRepository;
        this.ingestionDocumentRepository = ingestionDocumentRepository;
        this.occurrenceRepository = occurrenceRepository;
        this.questionRepository = questionRepository;
        this.questionService = questionService;
        this.objectMapper = objectMapper;
    }

    /**
     * Fetches, stores (dedup'd by sha256, same as TASK-2401), extracts per-page text, splits
     * it into candidate question blocks, and stages one {@code question_candidates} row per
     * block. Re-ingesting the same document is safe — {@code DocumentStoreService} dedups
     * the bytes, and {@code question_raw_extractions}' own unique index skips a
     * (document, extractor_version, position) triple that already exists.
     *
     * <p>Deliberately carries no ambient transaction of its own — same reasoning
     * {@code NoticeDiscoveryService#scan}'s own doc comment already gives for its sibling
     * pipeline: each block is staged by {@link QuestionCandidateStagingService} in its own
     * {@code REQUIRES_NEW} transaction, caught individually here, so one malformed or failing
     * block can never roll back every other candidate already staged from the same document —
     * a hundred-question PDF with one garbled block should still yield ninety-nine usable
     * candidates, not zero.
     */
    public IngestSummary ingest(String sourceUrl) {
        byte[] bytes = documentFetcher.fetch(sourceUrl);
        return ingestBytes(sourceUrl, bytes);
    }

    /**
     * The part of {@link #ingest} that doesn't touch the network — split out so a test can
     * exercise the real store/extract/split/stage/validate/duplicate-check pipeline against a
     * synthetic in-memory PDF without needing {@link DocumentFetcher}/{@code
     * OutboundUrlGuard} to accept a reachable URL (this project's own established precedent
     * for this exact tension — see {@code DocumentStoreServiceTest}'s own doc comment: the
     * network-fetching half is verified once, manually, against a real URL; everything after
     * fetch is what automated tests cover). Also directly usable later for an admin
     * file-upload path, should one ever be added.
     */
    public IngestSummary ingestBytes(String sourceUrl, byte[] bytes) {
        IngestionDocument document = documentStoreService.store(sourceUrl, null, bytes);

        PdfTextExtractor.ExtractionResult extraction = pdfTextExtractor.extract(bytes);
        document.setPageCount(extraction.pageCount());
        document.setIsTextExtractable(extraction.textExtractable());
        document = ingestionDocumentRepository.save(document);

        if (!extraction.textExtractable()) {
            return new IngestSummary(document.getId(), 0, 0, 0, 0);
        }

        List<QuestionCandidate> createdThisPass = new ArrayList<>();
        int position = 0;
        for (int pageIndex = 0; pageIndex < extraction.perPageText().size(); pageIndex++) {
            int pageNumber = pageIndex + 1;
            for (RawQuestionBlock block : questionRawExtractor.split(extraction.perPageText().get(pageIndex))) {
                position++;
                if (rawExtractionRepository
                        .findByDocument_IdAndExtractorVersionAndPositionInDocument(document.getId(), EXTRACTOR_VERSION, position)
                        .isPresent()) {
                    continue;
                }
                try {
                    createdThisPass.add(stagingService.stageOne(document, EXTRACTOR_VERSION, position, pageNumber, block));
                } catch (RuntimeException e) {
                    log.warn("Failed to stage question candidate at document {} position {}: {}",
                            document.getId(), position, e.getMessage());
                }
            }
        }

        return summarize(document.getId(), createdThisPass);
    }

    private static IngestSummary summarize(UUID documentId, List<QuestionCandidate> created) {
        int autoAcceptable = 0;
        int needsReview = 0;
        int possibleDuplicates = 0;
        for (QuestionCandidate candidate : created) {
            boolean hasWarnings = candidate.getValidationWarnings() != null;
            boolean isDuplicate = candidate.getPossibleDuplicateOfQuestionId() != null;
            if (isDuplicate) {
                possibleDuplicates++;
            }
            if (candidate.getConfidence() == ExtractionConfidence.HIGH && !hasWarnings && !isDuplicate) {
                autoAcceptable++;
            } else {
                needsReview++;
            }
        }
        return new IngestSummary(documentId, created.size(), autoAcceptable, needsReview, possibleDuplicates);
    }

    @Transactional(readOnly = true)
    public List<IngestedDocumentResponse> listDocuments() {
        return ingestionDocumentRepository.findByNoticeIsNullOrderByCreatedAtDesc().stream()
                .map(doc -> new IngestedDocumentResponse(
                        doc.getId(), doc.getSourceUrl(), doc.getPageCount(), doc.getIsTextExtractable(),
                        candidateRepository.findByDocumentId(doc.getId()).size(),
                        doc.getCreatedAt()))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<QuestionCandidateResponse> listCandidates(UUID documentId, ExtractionReviewStatus status) {
        List<QuestionCandidate> candidates = status == null
                ? candidateRepository.findByDocumentId(documentId)
                : candidateRepository.findByDocumentIdAndStatus(documentId, status);
        return candidates.stream().map(QuestionIngestionService::toResponse).toList();
    }

    /**
     * Merges {@code overrides} (topicId/examCodes/difficulty, or any correction) into the
     * stored payload, deserializes into the real {@code CreateQuestionRequest} DTO, and calls
     * the unmodified {@code QuestionService.create()} — the same "deserialize and call the
     * existing service method" pattern {@code ReviewQueueService.accept} already uses for
     * exam-guidance candidates. The created question is then set {@code content_status =
     * DRAFT} (never PUBLISHED directly from here) and gains a real {@code question_occurrences}
     * row pointing back at its source document/page.
     */
    @Transactional
    public QuestionCandidateResponse accept(UUID candidateId, Map<String, Object> overrides) {
        QuestionCandidate candidate = requireCandidate(candidateId);
        requirePending(candidate);

        Map<String, Object> merged = new HashMap<>(candidate.getPayload());
        if (overrides != null) {
            merged.putAll(overrides);
        }
        CreateQuestionRequest request;
        try {
            request = objectMapper.convertValue(merged, CreateQuestionRequest.class);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Candidate payload doesn't match CreateQuestionRequest: " + e.getMessage(), e);
        }

        QuestionResponse created = questionService.create(request);
        questionService.setContentStatus(created.getId(), ContentStatus.DRAFT);

        QuestionRawExtraction raw = candidate.getRawExtraction();
        QuestionOccurrence occurrence = new QuestionOccurrence();
        occurrence.setQuestion(questionRepository.getReferenceById(created.getId()));
        occurrence.setSourceDocumentId(raw.getDocument().getId());
        occurrence.setPageNumber(raw.getPageNumber());
        occurrence.setQuestionNumber(raw.getPositionInDocument());
        occurrence.setLegacyDerived(false);
        occurrence.setCreatedAt(OffsetDateTime.now());
        occurrenceRepository.save(occurrence);

        candidate.setStatus(ExtractionReviewStatus.ACCEPTED);
        candidate.setAppliedQuestionId(created.getId());
        candidate.setReviewedAt(OffsetDateTime.now());
        return toResponse(candidateRepository.save(candidate));
    }

    @Transactional
    public QuestionCandidateResponse reject(UUID candidateId, String reason) {
        QuestionCandidate candidate = requireCandidate(candidateId);
        requirePending(candidate);
        candidate.setStatus(ExtractionReviewStatus.REJECTED);
        candidate.setRejectionReason(reason);
        candidate.setReviewedAt(OffsetDateTime.now());
        return toResponse(candidateRepository.save(candidate));
    }

    private QuestionCandidate requireCandidate(UUID candidateId) {
        return candidateRepository.findById(candidateId)
                .orElseThrow(() -> new NoSuchElementException("Candidate not found: " + candidateId));
    }

    /**
     * {@code IllegalArgumentException}, not {@code IllegalStateException} — the latter has no
     * handler in {@code GlobalExceptionHandler} and falls through to a bare 500, which would
     * misrepresent an ordinary "already reviewed" conflict as a server error.
     */
    private static void requirePending(QuestionCandidate candidate) {
        if (candidate.getStatus() != ExtractionReviewStatus.PENDING) {
            throw new IllegalArgumentException("This candidate has already been reviewed (" + candidate.getStatus() + ")");
        }
    }

    private static QuestionCandidateResponse toResponse(QuestionCandidate candidate) {
        QuestionRawExtraction raw = candidate.getRawExtraction();
        return new QuestionCandidateResponse(
                candidate.getId(),
                raw.getDocument().getId(),
                raw.getPageNumber(),
                candidate.getPayload(),
                candidate.getConfidence().name(),
                candidate.getValidationWarnings(),
                candidate.getPossibleDuplicateOfQuestionId(),
                candidate.getDuplicateSimilarityPercent(),
                candidate.getSourceExcerpt(),
                candidate.getStatus().name(),
                candidate.getRejectionReason(),
                candidate.getAppliedQuestionId(),
                candidate.getReviewedAt(),
                candidate.getCreatedAt());
    }
}
