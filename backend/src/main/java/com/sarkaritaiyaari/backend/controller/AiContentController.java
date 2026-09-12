package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.ai.content.AiContentGenerationService;
import com.sarkaritaiyaari.backend.ai.content.AiContentMapper;
import com.sarkaritaiyaari.backend.ai.content.AiContentReviewService;
import com.sarkaritaiyaari.backend.dto.AiContentDtos.AiContentResponse;
import com.sarkaritaiyaari.backend.dto.AiContentDtos.GenerateAiContentRequest;
import com.sarkaritaiyaari.backend.dto.AiContentDtos.GenerateAiContentResult;
import com.sarkaritaiyaari.backend.dto.AiContentDtos.RejectAiContentRequest;
import com.sarkaritaiyaari.backend.dto.AiContentDtos.TransitionAiContentRequest;
import com.sarkaritaiyaari.backend.entity.AiContentTask;
import com.sarkaritaiyaari.backend.entity.ContentStatus;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.service.AuthService;
import org.springframework.http.HttpHeaders;
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
import java.util.Locale;
import java.util.UUID;

/**
 * TASK-2701 Phase 2 — the review queue for AI-generated question/topic explanations.
 *
 * Generation is gated {@code requireAdmin} rather than {@code requireReviewer}: it is the one
 * action here that spends real money, and {@link com.sarkaritaiyaari.backend.entity.Role
 * REVIEWER} exists specifically as a narrower role than ADMIN with none of ADMIN's other
 * content-CRUD powers (see {@code Role.REVIEWER}'s own Javadoc) — triggering a paid generation
 * run is closer to that "other content-CRUD power" than to reviewing what already exists. Every
 * review transition is {@code requireReviewer}, exactly like {@code ExamGuideAdminController}'s
 * recruitment-cycle equivalents.
 *
 * No generic "explain this question" endpoint exists here or anywhere — the public-facing
 * surface for this content is Phase 3's reference sync, not a live request/response endpoint.
 */
@RestController
@RequestMapping("/api/admin/ai-content")
public class AiContentController {

    private final AiContentGenerationService generationService;
    private final AiContentReviewService reviewService;
    private final AiContentMapper mapper;
    private final AuthService authService;

    public AiContentController(AiContentGenerationService generationService,
                                AiContentReviewService reviewService,
                                AiContentMapper mapper,
                                AuthService authService) {
        this.generationService = generationService;
        this.reviewService = reviewService;
        this.mapper = mapper;
        this.authService = authService;
    }

    @PostMapping("/generate")
    public GenerateAiContentResult generate(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                             @RequestBody GenerateAiContentRequest request) {
        authService.requireAdmin(authorization);
        AiContentTask taskId = parseTask(request.taskId());
        return generationService.generate(taskId, request.languageCode(), request.subjectIds());
    }

    @GetMapping
    public List<AiContentResponse> list(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                         @RequestParam(required = false) String taskId,
                                         @RequestParam(defaultValue = "REVIEW") String status) {
        authService.requireReviewer(authorization);
        AiContentTask parsedTask = (taskId == null || taskId.isBlank()) ? null : parseTask(taskId);
        ContentStatus parsedStatus = parseStatus(status);
        return reviewService.list(parsedTask, parsedStatus).stream().map(mapper::toResponse).toList();
    }

    @GetMapping("/{id}")
    public AiContentResponse get(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                  @PathVariable UUID id) {
        authService.requireReviewer(authorization);
        return mapper.toResponse(reviewService.require(id));
    }

    @PutMapping("/{id}/submit-for-review")
    public AiContentResponse submitForReview(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                              @PathVariable UUID id,
                                              @RequestBody TransitionAiContentRequest request) {
        authService.requireReviewer(authorization);
        return mapper.toResponse(reviewService.submitForReview(id, request.expectedVersion()));
    }

    @PutMapping("/{id}/publish")
    public AiContentResponse publish(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                      @PathVariable UUID id,
                                      @RequestBody TransitionAiContentRequest request) {
        User reviewer = authService.requireReviewer(authorization);
        return mapper.toResponse(reviewService.publish(id, request.expectedVersion(), reviewer.getEmail()));
    }

    @PutMapping("/{id}/reject")
    public AiContentResponse reject(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                     @PathVariable UUID id,
                                     @RequestBody RejectAiContentRequest request) {
        User reviewer = authService.requireReviewer(authorization);
        return mapper.toResponse(
                reviewService.reject(id, request.reason(), request.expectedVersion(), reviewer.getEmail()));
    }

    @PutMapping("/{id}/unpublish")
    public AiContentResponse unpublish(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                        @PathVariable UUID id,
                                        @RequestBody TransitionAiContentRequest request) {
        User reviewer = authService.requireReviewer(authorization);
        return mapper.toResponse(reviewService.unpublish(id, request.expectedVersion(), reviewer.getEmail()));
    }

    private static AiContentTask parseTask(String taskId) {
        try {
            return AiContentTask.valueOf(taskId.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new IllegalArgumentException("Unknown AI content task: " + taskId);
        }
    }

    private static ContentStatus parseStatus(String status) {
        try {
            return ContentStatus.valueOf(status.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException | NullPointerException e) {
            throw new IllegalArgumentException("Unknown content status: " + status);
        }
    }
}
