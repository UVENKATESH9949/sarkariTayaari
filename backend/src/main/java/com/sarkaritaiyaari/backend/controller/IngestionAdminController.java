package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.IngestionAdminDtos.AcceptCandidateRequest;
import com.sarkaritaiyaari.backend.dto.IngestionAdminDtos.IngestionDocumentResponse;
import com.sarkaritaiyaari.backend.dto.IngestionAdminDtos.IngestionExtractionResultResponse;
import com.sarkaritaiyaari.backend.dto.IngestionAdminDtos.IngestionNoticeResponse;
import com.sarkaritaiyaari.backend.dto.IngestionAdminDtos.IngestionSourceRequest;
import com.sarkaritaiyaari.backend.dto.IngestionAdminDtos.IngestionSourceResponse;
import com.sarkaritaiyaari.backend.dto.IngestionAdminDtos.RejectCandidateRequest;
import com.sarkaritaiyaari.backend.dto.IngestionAdminDtos.ScanResult;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.IngestionSourceService;
import com.sarkaritaiyaari.backend.service.NoticeDiscoveryService;
import com.sarkaritaiyaari.backend.service.ReviewQueueService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * TASK-2401 Document 12 -- admin-only endpoints for the ingestion pipeline. Task 2
 * shipped Source Registry CRUD; Task 3 adds scan + notices. Extraction-jobs/review-queue
 * endpoints join this controller as their own tasks in the approved MVP plan land. Every
 * existing public Exam Guide endpoint is untouched -- this is a new, separate surface.
 */
@RestController
@RequestMapping("/api/admin/ingestion")
public class IngestionAdminController {

    private final IngestionSourceService sourceService;
    private final NoticeDiscoveryService noticeDiscoveryService;
    private final ReviewQueueService reviewQueueService;
    private final AuthService authService;

    public IngestionAdminController(IngestionSourceService sourceService,
                                     NoticeDiscoveryService noticeDiscoveryService,
                                     ReviewQueueService reviewQueueService,
                                     AuthService authService) {
        this.sourceService = sourceService;
        this.noticeDiscoveryService = noticeDiscoveryService;
        this.reviewQueueService = reviewQueueService;
        this.authService = authService;
    }

    @PostMapping("/sources")
    public ResponseEntity<IngestionSourceResponse> createSource(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @Valid @RequestBody IngestionSourceRequest request) {
        authService.requireAdmin(authorization);
        return ResponseEntity.status(HttpStatus.CREATED).body(sourceService.createSource(request));
    }

    @PutMapping("/sources/{id}")
    public IngestionSourceResponse updateSource(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                 @PathVariable UUID id,
                                                 @Valid @RequestBody IngestionSourceRequest request) {
        authService.requireAdmin(authorization);
        return sourceService.updateSource(id, request);
    }

    @GetMapping("/sources")
    public List<IngestionSourceResponse> listSources(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        authService.requireAdmin(authorization);
        return sourceService.listSources();
    }

    @DeleteMapping("/sources/{id}")
    public ResponseEntity<Void> deleteSource(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                              @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        sourceService.deleteSource(id);
        return ResponseEntity.noContent().build();
    }

    /** TASK-2401 Document 2 -- the manual/Cloud-Scheduler-triggered entry point, mirroring
     * {@code POST /api/admin/reminders/dispatch}'s exact shape (no {@code @Scheduled} --
     * see that controller's own class doc for why). */
    @PostMapping("/sources/{id}/scan")
    public ScanResult scanSource(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                  @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        return noticeDiscoveryService.scan(id);
    }

    /** {@code status}: {@code ACTIVE} (default, removedAt is null), {@code REMOVED}, or {@code ALL}. */
    @GetMapping("/sources/{id}/notices")
    public List<IngestionNoticeResponse> listNotices(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                      @PathVariable UUID id,
                                                      @RequestParam(defaultValue = "ACTIVE") String status) {
        authService.requireAdmin(authorization);
        return noticeDiscoveryService.listNotices(id, status);
    }

    /** TASK-2401 Task 4 -- every document stored for any notice under this source. */
    @GetMapping("/sources/{id}/documents")
    public List<IngestionDocumentResponse> listDocuments(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                          @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        return noticeDiscoveryService.listDocuments(id);
    }

    /** TASK-2401 Task 6 -- every extraction candidate produced so far, across every
     * notice under this source. */
    @GetMapping("/sources/{id}/extraction-results")
    public List<IngestionExtractionResultResponse> listExtractionResults(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        return noticeDiscoveryService.listExtractionResults(id);
    }

    /** TASK-2401 Task 8 -- one candidate's full detail. */
    @GetMapping("/review-queue/{id}")
    public IngestionExtractionResultResponse getReviewQueueItem(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        return reviewQueueService.get(id);
    }

    /** Turns this candidate into a real Exam Guide row via the exact same existing
     * service method the admin console's own CRUD forms already call. */
    @PostMapping("/review-queue/{id}/accept")
    public IngestionExtractionResultResponse acceptReviewQueueItem(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id,
            @RequestBody(required = false) AcceptCandidateRequest request) {
        authService.requireAdmin(authorization);
        Map<String, Object> overrides = request != null ? request.overrides() : null;
        UUID recruitmentCycleId = request != null ? request.recruitmentCycleId() : null;
        return reviewQueueService.accept(id, overrides, recruitmentCycleId);
    }

    @PostMapping("/review-queue/{id}/reject")
    public IngestionExtractionResultResponse rejectReviewQueueItem(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id,
            @Valid @RequestBody RejectCandidateRequest request) {
        authService.requireAdmin(authorization);
        return reviewQueueService.reject(id, request.reason());
    }
}
