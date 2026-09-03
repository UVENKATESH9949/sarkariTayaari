package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.ApplicationMistakeRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.ApplicationMistakeResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.ApplicationStepRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.ApplicationStepResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.CareerPostRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.CareerPostResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.DocumentRequirementRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.DocumentRequirementResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.EligibilityRuleRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.EligibilityRuleResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.ExamSourceRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.ExamSourceResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.FeeRuleRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.FeeRuleResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.ImportantDateRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.ImportantDateResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.RecruitmentCycleRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.RecruitmentCycleResponse;
import com.sarkaritaiyaari.backend.entity.ContentStatus;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.ExamGuideService;
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
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Admin CRUD for the Exam Guide content model (spec §35 "Admin / Content Management").
 * Every write here requires an admin token — this is exactly the content the spec's §58
 * says users must never be able to modify.
 *
 * <p>One controller for all seven cycle-scoped resource types, matching
 * {@code ExamStructureController}'s "kept together because they're only ever meaningful
 * as parts of the same tree" rationale — every one of these is meaningless without the
 * recruitment cycle it belongs to.
 */
@RestController
public class ExamGuideAdminController {

    private final ExamGuideService examGuideService;
    private final AuthService authService;

    public ExamGuideAdminController(ExamGuideService examGuideService, AuthService authService) {
        this.examGuideService = examGuideService;
        this.authService = authService;
    }

    /* ---------------------------------------------------------------------- Recruitment cycles */

    @PostMapping("/api/recruitment-cycles")
    public ResponseEntity<RecruitmentCycleResponse> createCycle(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @Valid @RequestBody RecruitmentCycleRequest request) {
        authService.requireAdmin(authorization);
        return ResponseEntity.status(HttpStatus.CREATED).body(examGuideService.createCycle(request));
    }

    @PutMapping("/api/recruitment-cycles/{id}")
    public RecruitmentCycleResponse updateCycle(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                 @PathVariable UUID id,
                                                 @Valid @RequestBody RecruitmentCycleRequest request) {
        authService.requireAdmin(authorization);
        return examGuideService.updateCycle(id, request);
    }

    @GetMapping("/api/exams/{examCode}/recruitment-cycles")
    public List<RecruitmentCycleResponse> listCycles(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                       @PathVariable String examCode) {
        authService.requireAdmin(authorization);
        return examGuideService.listCyclesForExam(examCode);
    }

    @DeleteMapping("/api/recruitment-cycles/{id}")
    public ResponseEntity<Void> deleteCycle(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                             @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        examGuideService.deleteCycle(id);
        return ResponseEntity.noContent().build();
    }

    /**
     * Spec §36's three-state workflow: DRAFT -[submit-for-review]-> REVIEW
     * -[publish]-> PUBLISHED, or REVIEW -[reject]-> DRAFT. {@code publish} also accepts
     * DRAFT directly (skipping review) so today's fast-path/demo-seeder usage keeps
     * working unchanged. Publish/reject/unpublish accept REVIEWER or ADMIN — ADMIN is a
     * superset (see {@link com.sarkaritaiyaari.backend.entity.Role#REVIEWER}) — while
     * submitting for review is ADMIN-only (a reviewer doesn't author content).
     */
    @PutMapping("/api/recruitment-cycles/{id}/submit-for-review")
    public RecruitmentCycleResponse submitForReview(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                      @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        return examGuideService.setCycleContentStatus(id, ContentStatus.REVIEW);
    }

    @PutMapping("/api/recruitment-cycles/{id}/reject")
    public RecruitmentCycleResponse rejectCycle(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                 @PathVariable UUID id) {
        authService.requireReviewer(authorization);
        return examGuideService.setCycleContentStatus(id, ContentStatus.DRAFT);
    }

    @PutMapping("/api/recruitment-cycles/{id}/publish")
    public RecruitmentCycleResponse publishCycle(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                  @PathVariable UUID id) {
        authService.requireReviewer(authorization);
        return examGuideService.setCycleContentStatus(id, ContentStatus.PUBLISHED);
    }

    @PutMapping("/api/recruitment-cycles/{id}/unpublish")
    public RecruitmentCycleResponse unpublishCycle(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                    @PathVariable UUID id) {
        authService.requireReviewer(authorization);
        return examGuideService.setCycleContentStatus(id, ContentStatus.DRAFT);
    }

    /* ---------------------------------------------------------------------- Sources */

    @PostMapping("/api/exam-sources")
    public ResponseEntity<ExamSourceResponse> createSource(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                             @Valid @RequestBody ExamSourceRequest request) {
        authService.requireAdmin(authorization);
        return ResponseEntity.status(HttpStatus.CREATED).body(examGuideService.createSource(request));
    }

    @PutMapping("/api/exam-sources/{id}")
    public ExamSourceResponse updateSource(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                            @PathVariable UUID id, @Valid @RequestBody ExamSourceRequest request) {
        authService.requireAdmin(authorization);
        return examGuideService.updateSource(id, request);
    }

    @GetMapping("/api/exam-sources")
    public List<ExamSourceResponse> listSources(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        authService.requireAdmin(authorization);
        return examGuideService.listSources();
    }

    @DeleteMapping("/api/exam-sources/{id}")
    public ResponseEntity<Void> deleteSource(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                              @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        examGuideService.deleteSource(id);
        return ResponseEntity.noContent().build();
    }

    /* ---------------------------------------------------------------------- Eligibility (1:1) */

    @PutMapping("/api/recruitment-cycles/{cycleId}/eligibility")
    public EligibilityRuleResponse upsertEligibility(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                       @PathVariable UUID cycleId,
                                                       @Valid @RequestBody EligibilityRuleRequest request) {
        authService.requireAdmin(authorization);
        return examGuideService.upsertEligibility(cycleId, request);
    }

    @GetMapping("/api/recruitment-cycles/{cycleId}/eligibility")
    public ResponseEntity<EligibilityRuleResponse> getEligibility(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID cycleId) {
        authService.requireAdmin(authorization);
        Optional<EligibilityRuleResponse> rule = examGuideService.getEligibility(cycleId);
        return rule.map(ResponseEntity::ok).orElseGet(() -> ResponseEntity.noContent().build());
    }

    /* ---------------------------------------------------------------------- Important dates */

    @PostMapping("/api/recruitment-cycles/{cycleId}/important-dates")
    public ResponseEntity<ImportantDateResponse> createImportantDate(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID cycleId,
            @Valid @RequestBody ImportantDateRequest request) {
        authService.requireAdmin(authorization);
        return ResponseEntity.status(HttpStatus.CREATED).body(examGuideService.createImportantDate(cycleId, request));
    }

    @PutMapping("/api/important-dates/{id}")
    public ImportantDateResponse updateImportantDate(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                       @PathVariable UUID id,
                                                       @Valid @RequestBody ImportantDateRequest request) {
        authService.requireAdmin(authorization);
        return examGuideService.updateImportantDate(id, request);
    }

    @GetMapping("/api/recruitment-cycles/{cycleId}/important-dates")
    public List<ImportantDateResponse> listImportantDates(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                            @PathVariable UUID cycleId) {
        authService.requireAdmin(authorization);
        return examGuideService.listImportantDates(cycleId);
    }

    @DeleteMapping("/api/important-dates/{id}")
    public ResponseEntity<Void> deleteImportantDate(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                     @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        examGuideService.deleteImportantDate(id);
        return ResponseEntity.noContent().build();
    }

    /* ---------------------------------------------------------------------- Document requirements */

    @PostMapping("/api/recruitment-cycles/{cycleId}/document-requirements")
    public ResponseEntity<DocumentRequirementResponse> createDocumentRequirement(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID cycleId,
            @Valid @RequestBody DocumentRequirementRequest request) {
        authService.requireAdmin(authorization);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(examGuideService.createDocumentRequirement(cycleId, request));
    }

    @PutMapping("/api/document-requirements/{id}")
    public DocumentRequirementResponse updateDocumentRequirement(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id,
            @Valid @RequestBody DocumentRequirementRequest request) {
        authService.requireAdmin(authorization);
        return examGuideService.updateDocumentRequirement(id, request);
    }

    @GetMapping("/api/recruitment-cycles/{cycleId}/document-requirements")
    public List<DocumentRequirementResponse> listDocumentRequirements(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID cycleId) {
        authService.requireAdmin(authorization);
        return examGuideService.listDocumentRequirements(cycleId);
    }

    @DeleteMapping("/api/document-requirements/{id}")
    public ResponseEntity<Void> deleteDocumentRequirement(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                           @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        examGuideService.deleteDocumentRequirement(id);
        return ResponseEntity.noContent().build();
    }

    /* ---------------------------------------------------------------------- Application steps */

    @PostMapping("/api/recruitment-cycles/{cycleId}/application-steps")
    public ResponseEntity<ApplicationStepResponse> createApplicationStep(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID cycleId,
            @Valid @RequestBody ApplicationStepRequest request) {
        authService.requireAdmin(authorization);
        return ResponseEntity.status(HttpStatus.CREATED).body(examGuideService.createApplicationStep(cycleId, request));
    }

    @PutMapping("/api/application-steps/{id}")
    public ApplicationStepResponse updateApplicationStep(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                           @PathVariable UUID id,
                                                           @Valid @RequestBody ApplicationStepRequest request) {
        authService.requireAdmin(authorization);
        return examGuideService.updateApplicationStep(id, request);
    }

    @GetMapping("/api/recruitment-cycles/{cycleId}/application-steps")
    public List<ApplicationStepResponse> listApplicationSteps(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                                @PathVariable UUID cycleId) {
        authService.requireAdmin(authorization);
        return examGuideService.listApplicationSteps(cycleId);
    }

    @DeleteMapping("/api/application-steps/{id}")
    public ResponseEntity<Void> deleteApplicationStep(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                       @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        examGuideService.deleteApplicationStep(id);
        return ResponseEntity.noContent().build();
    }

    /* ---------------------------------------------------------------------- Application mistakes */

    @PostMapping("/api/recruitment-cycles/{cycleId}/application-mistakes")
    public ResponseEntity<ApplicationMistakeResponse> createApplicationMistake(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID cycleId,
            @Valid @RequestBody ApplicationMistakeRequest request) {
        authService.requireAdmin(authorization);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(examGuideService.createApplicationMistake(cycleId, request));
    }

    @PutMapping("/api/application-mistakes/{id}")
    public ApplicationMistakeResponse updateApplicationMistake(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID id,
            @Valid @RequestBody ApplicationMistakeRequest request) {
        authService.requireAdmin(authorization);
        return examGuideService.updateApplicationMistake(id, request);
    }

    @GetMapping("/api/recruitment-cycles/{cycleId}/application-mistakes")
    public List<ApplicationMistakeResponse> listApplicationMistakes(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization, @PathVariable UUID cycleId) {
        authService.requireAdmin(authorization);
        return examGuideService.listApplicationMistakes(cycleId);
    }

    @DeleteMapping("/api/application-mistakes/{id}")
    public ResponseEntity<Void> deleteApplicationMistake(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                          @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        examGuideService.deleteApplicationMistake(id);
        return ResponseEntity.noContent().build();
    }

    /* ---------------------------------------------------------------------- Fee rules */

    @PostMapping("/api/recruitment-cycles/{cycleId}/fee-rules")
    public ResponseEntity<FeeRuleResponse> createFeeRule(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                           @PathVariable UUID cycleId,
                                                           @Valid @RequestBody FeeRuleRequest request) {
        authService.requireAdmin(authorization);
        return ResponseEntity.status(HttpStatus.CREATED).body(examGuideService.createFeeRule(cycleId, request));
    }

    @PutMapping("/api/fee-rules/{id}")
    public FeeRuleResponse updateFeeRule(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                          @PathVariable UUID id, @Valid @RequestBody FeeRuleRequest request) {
        authService.requireAdmin(authorization);
        return examGuideService.updateFeeRule(id, request);
    }

    @GetMapping("/api/recruitment-cycles/{cycleId}/fee-rules")
    public List<FeeRuleResponse> listFeeRules(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                               @PathVariable UUID cycleId) {
        authService.requireAdmin(authorization);
        return examGuideService.listFeeRules(cycleId);
    }

    @DeleteMapping("/api/fee-rules/{id}")
    public ResponseEntity<Void> deleteFeeRule(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                               @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        examGuideService.deleteFeeRule(id);
        return ResponseEntity.noContent().build();
    }

    /* ---------------------------------------------------------------------- Career posts (§25/§26) */

    @PostMapping("/api/career-posts")
    public ResponseEntity<CareerPostResponse> createCareerPost(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                                 @Valid @RequestBody CareerPostRequest request) {
        authService.requireAdmin(authorization);
        return ResponseEntity.status(HttpStatus.CREATED).body(examGuideService.createCareerPost(request));
    }

    @PutMapping("/api/career-posts/{id}")
    public CareerPostResponse updateCareerPost(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                @PathVariable UUID id, @Valid @RequestBody CareerPostRequest request) {
        authService.requireAdmin(authorization);
        return examGuideService.updateCareerPost(id, request);
    }

    @GetMapping("/api/exams/{examCode}/career-posts")
    public List<CareerPostResponse> listCareerPosts(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                      @PathVariable String examCode) {
        authService.requireAdmin(authorization);
        return examGuideService.listCareerPosts(examCode);
    }

    @DeleteMapping("/api/career-posts/{id}")
    public ResponseEntity<Void> deleteCareerPost(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                  @PathVariable UUID id) {
        authService.requireAdmin(authorization);
        examGuideService.deleteCareerPost(id);
        return ResponseEntity.noContent().build();
    }
}
