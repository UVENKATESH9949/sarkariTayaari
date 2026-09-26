package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.BulkDeleteRequest;
import com.sarkaritaiyaari.backend.dto.BulkDeleteResponse;
import com.sarkaritaiyaari.backend.dto.BulkImportRequest;
import com.sarkaritaiyaari.backend.dto.BulkImportResponse;
import com.sarkaritaiyaari.backend.dto.CreateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.QuestionResponse;
import com.sarkaritaiyaari.backend.dto.UpdateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.UpsertTranslationRequest;
import com.sarkaritaiyaari.backend.entity.ContentStatus;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.QuestionService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
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
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/questions")
public class QuestionController {

    private final QuestionService questionService;
    private final AuthService authService;

    public QuestionController(QuestionService questionService, AuthService authService) {
        this.questionService = questionService;
        this.authService = authService;
    }

    @PostMapping
    public ResponseEntity<QuestionResponse> create(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                     @Valid @RequestBody CreateQuestionRequest request) {
        authService.requireAdmin(authorization);
        QuestionResponse created = questionService.create(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(created);
    }

    @GetMapping("/{id}")
    public QuestionResponse get(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        return questionService.get(id);
    }

    @GetMapping
    public Page<QuestionResponse> list(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                        Pageable pageable,
                                        @RequestParam(required = false) String examCode,
                                        @RequestParam(required = false) UUID subjectId,
                                        @RequestParam(required = false) UUID topicId,
                                        @RequestParam(required = false) String difficulty) {
        authService.requireAdmin(authorization);
        return questionService.list(pageable, examCode, subjectId, topicId, difficulty);
    }

    /**
     * Always syncs the entire question bank (paginated by updatedAt) — clients filter by
     * exam locally. Deliberately public: this is what a signed-out student's app downloads
     * on first launch and on every delta sync after.
     *
     * <p>{@code supportedTypes} implements capability negotiation (TASK-2301 Phase P3) — a
     * comma-separated list of question type codes this client can render/evaluate. Omitted
     * entirely, a client is treated as predating this mechanism and receives SINGLE_CHOICE
     * only, byte-identical to what every client received before any other type existed.
     */
    @GetMapping("/sync")
    public Page<QuestionResponse> sync(@RequestParam(required = false) String since,
                                        @RequestParam(defaultValue = "0") int page,
                                        @RequestParam(defaultValue = "500") int size,
                                        @RequestParam(required = false) String supportedTypes) {
        return questionService.sync(since, page, size, supportedTypes);
    }

    /**
     * Public, filterable, non-timestamp-cursor read for the mobile app's hybrid
     * online/local data layer — used while a device's first-ever sync hasn't finished
     * yet (or has never run), so browsing isn't gated on local SQLite being populated.
     * Unlike /sync, this is filterable by topic/subject/difficulty and excludes
     * soft-deleted questions, since it's meant to be read directly by screens, not
     * paged through wholesale.
     */
    @GetMapping("/live")
    public Page<QuestionResponse> live(@RequestParam(required = false) String examCode,
                                        @RequestParam(required = false) UUID subjectId,
                                        @RequestParam(required = false) UUID topicId,
                                        @RequestParam(required = false) String difficulty,
                                        @RequestParam(defaultValue = "0") int page,
                                        @RequestParam(defaultValue = "200") int size,
                                        @RequestParam(required = false) String supportedTypes) {
        return questionService.listPublic(examCode, subjectId, topicId, difficulty, page, size, supportedTypes);
    }

    /**
     * Grouped question counts (by exam/subject/topic/difficulty) for the hybrid data
     * layer's "how many questions does X have" screens — public, same reasoning as /live.
     */
    @GetMapping("/counts")
    public Map<String, Long> counts(@RequestParam String groupBy,
                                     @RequestParam(required = false) String examCode,
                                     @RequestParam(required = false) UUID subjectId,
                                     @RequestParam(required = false) UUID topicId,
                                     @RequestParam(required = false) String difficulty) {
        return questionService.countsGroupedBy(groupBy, examCode, subjectId, topicId, difficulty);
    }

    /**
     * Batch hydration by id — public, same visibility as /live. Built for a client with no
     * local question bank (the web app) to turn a bare questionId from a session/attempt
     * review or a bookmark into real content. Capped at 100 ids per call.
     */
    @GetMapping("/by-ids")
    public List<QuestionResponse> byIds(@RequestParam List<UUID> ids) {
        return questionService.getByIds(ids);
    }

    /**
     * Mock Test's per-section availability, live — how many non-deleted questions exist across
     * this set of subjects for this exam. {@code topicIds}/{@code difficultyCode}/{@code pyqOnly}
     * are optional, additive narrowings for the Mock Test Hub's ad-hoc formats (Topic/Difficulty/
     * PYQ/Weak Area Mock etc.) — omitted, this behaves exactly as it always has.
     */
    @GetMapping("/mock-count")
    public Map<String, Long> mockCount(@RequestParam String examCode,
                                        @RequestParam List<UUID> subjectIds,
                                        @RequestParam(required = false) List<UUID> topicIds,
                                        @RequestParam(required = false) String difficultyCode,
                                        @RequestParam(required = false, defaultValue = "false") boolean pyqOnly) {
        return Map.of("count", questionService.countForMock(examCode, subjectIds, topicIds, difficultyCode, pyqOnly));
    }

    /**
     * Mock Test's attempt assembly, live — a genuinely random sample across this set of subjects
     * for this exam, narrowable the same optional way {@link #mockCount} is.
     */
    @GetMapping("/mock-sample")
    public List<QuestionResponse> mockSample(@RequestParam String examCode,
                                              @RequestParam List<UUID> subjectIds,
                                              @RequestParam(required = false) List<UUID> topicIds,
                                              @RequestParam(required = false) String difficultyCode,
                                              @RequestParam(required = false, defaultValue = "false") boolean pyqOnly,
                                              @RequestParam(defaultValue = "50") int limit) {
        return questionService.sampleForMock(examCode, subjectIds, topicIds, difficultyCode, pyqOnly, limit);
    }

    @PutMapping("/{id}")
    public QuestionResponse update(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                    @PathVariable UUID id, @Valid @RequestBody UpdateQuestionRequest request) {
        authService.requireAdmin(authorization);
        return questionService.update(id, request);
    }

    @PutMapping("/{id}/translations/{lang}")
    public QuestionResponse upsertTranslation(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                               @PathVariable UUID id,
                                               @PathVariable String lang,
                                               @Valid @RequestBody UpsertTranslationRequest request) {
        authService.requireAdmin(authorization);
        return questionService.upsertTranslation(id, lang, request);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        questionService.delete(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * A one-click content-status change (TASK-2501 Phase 2), body {"status": "DRAFT" |
     * "REVIEW" | "PUBLISHED"} — mirrors the Exam Guide cycle's own one-click publish/
     * unpublish toggle. Gated with {@code requireReviewer} (ADMIN or REVIEWER), not
     * {@code requireAdmin} — same role either can already act on for Exam Guide content.
     */
    @PutMapping("/{id}/content-status")
    public QuestionResponse setContentStatus(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                              @PathVariable UUID id,
                                              @RequestBody Map<String, String> body) {
        authService.requireReviewer(authorization);
        String raw = body.get("status");
        if (raw == null || raw.isBlank()) {
            throw new IllegalArgumentException("status is required");
        }
        ContentStatus status;
        try {
            status = ContentStatus.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("status must be DRAFT, REVIEW, or PUBLISHED");
        }
        return questionService.setContentStatus(id, status);
    }

    @PostMapping("/bulk-import")
    public ResponseEntity<BulkImportResponse> bulkImport(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                           @Valid @RequestBody BulkImportRequest request) {
        authService.requireAdmin(authorization);
        return ResponseEntity.status(HttpStatus.CREATED).body(questionService.bulkImport(request.getQuestions()));
    }

    @PostMapping("/bulk-delete")
    public BulkDeleteResponse bulkDelete(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                          @Valid @RequestBody BulkDeleteRequest request) {
        authService.requireAdmin(authorization);
        int count = questionService.bulkDelete(request.getIds());
        return new BulkDeleteResponse(count);
    }
}
