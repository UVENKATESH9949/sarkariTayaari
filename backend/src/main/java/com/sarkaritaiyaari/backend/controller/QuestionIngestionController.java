package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.QuestionIngestionDtos.AcceptQuestionCandidateRequest;
import com.sarkaritaiyaari.backend.dto.QuestionIngestionDtos.IngestDocumentRequest;
import com.sarkaritaiyaari.backend.dto.QuestionIngestionDtos.IngestSummary;
import com.sarkaritaiyaari.backend.dto.QuestionIngestionDtos.IngestedDocumentResponse;
import com.sarkaritaiyaari.backend.dto.QuestionIngestionDtos.QuestionCandidateResponse;
import com.sarkaritaiyaari.backend.dto.QuestionIngestionDtos.RejectQuestionCandidateRequest;
import com.sarkaritaiyaari.backend.entity.ExtractionReviewStatus;
import com.sarkaritaiyaari.backend.ingestion.DocumentFetcher;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.QuestionIngestionService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

/**
 * TASK-2501 Phase 2 -- admin-only, mirroring {@code IngestionAdminController}'s exact shape
 * for the sibling exam-guidance pipeline.
 */
@RestController
@RequestMapping("/api/admin/question-ingestion")
public class QuestionIngestionController {

    private final AuthService authService;
    private final QuestionIngestionService ingestionService;

    public QuestionIngestionController(AuthService authService, QuestionIngestionService ingestionService) {
        this.authService = authService;
        this.ingestionService = ingestionService;
    }

    @PostMapping("/documents")
    public ResponseEntity<IngestSummary> ingestDocument(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @Valid @RequestBody IngestDocumentRequest request) {
        authService.requireAdmin(authorization);
        return ResponseEntity.status(HttpStatus.CREATED).body(ingestionService.ingest(request.sourceUrl()));
    }

    /**
     * A locally-uploaded PDF, not a URL — for when an admin has the paper on disk rather
     * than at a reachable public link (the original MVP shipped URL-only; this closes that
     * gap). Reuses {@link QuestionIngestionService#ingestBytes} directly, the same
     * store/extract/split/stage pipeline {@link #ingestDocument} uses after its own network
     * fetch — nothing about ingestion itself is different once bytes exist.
     */
    @PostMapping("/documents/upload")
    public ResponseEntity<IngestSummary> uploadDocument(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @RequestParam("file") MultipartFile file) throws IOException {
        authService.requireAdmin(authorization);
        if (file.isEmpty()) {
            throw new IllegalArgumentException("file is required");
        }
        if (file.getSize() > DocumentFetcher.MAX_BYTES) {
            throw new IllegalArgumentException(
                    "File exceeds the " + DocumentFetcher.MAX_BYTES + "-byte cap (" + file.getSize() + " bytes)");
        }
        String filename = file.getOriginalFilename();
        String sourceIdentifier = "local-upload:" + (filename == null || filename.isBlank() ? "unnamed.pdf" : filename);
        IngestSummary summary = ingestionService.ingestBytes(sourceIdentifier, file.getBytes());
        return ResponseEntity.status(HttpStatus.CREATED).body(summary);
    }

    @GetMapping("/documents")
    public List<IngestedDocumentResponse> listDocuments(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        authService.requireAdmin(authorization);
        return ingestionService.listDocuments();
    }

    @GetMapping("/candidates")
    public List<QuestionCandidateResponse> listCandidates(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @RequestParam UUID documentId,
            @RequestParam(required = false) String status) {
        authService.requireAdmin(authorization);
        ExtractionReviewStatus parsed = status == null || status.isBlank()
                ? null
                : ExtractionReviewStatus.valueOf(status.trim().toUpperCase(Locale.ROOT));
        return ingestionService.listCandidates(documentId, parsed);
    }

    @PostMapping("/candidates/{id}/accept")
    public QuestionCandidateResponse accept(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable UUID id,
            @RequestBody AcceptQuestionCandidateRequest request) {
        authService.requireAdmin(authorization);
        return ingestionService.accept(id, request.overrides());
    }

    @PostMapping("/candidates/{id}/reject")
    public QuestionCandidateResponse reject(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable UUID id,
            @Valid @RequestBody RejectQuestionCandidateRequest request) {
        authService.requireAdmin(authorization);
        return ingestionService.reject(id, request.reason());
    }
}
