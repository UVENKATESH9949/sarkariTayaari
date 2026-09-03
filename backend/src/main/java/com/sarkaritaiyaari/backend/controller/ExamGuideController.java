package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.ExamGuideDtos.CycleComparisonResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideDtos.ExamGuideResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideDtos.PreparePlanResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideDtos.RecruitmentCycleHistoryEntry;
import com.sarkaritaiyaari.backend.dto.ExamGuideDtos.UserDocumentStatusRequest;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.ExamGuideService;
import com.sarkaritaiyaari.backend.service.PreparePlanService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

/**
 * Mobile/public-facing Exam Guide reads, plus the one signed-in write this phase exposes.
 * The dates/eligibility/fees/documents content is deliberately public — same rule as
 * exam-structures and topic-intelligence — because withholding it would defeat the
 * point of a guide meant to help someone decide whether to apply.
 */
@RestController
public class ExamGuideController {

    private final ExamGuideService examGuideService;
    private final PreparePlanService preparePlanService;
    private final AuthService authService;

    public ExamGuideController(ExamGuideService examGuideService, PreparePlanService preparePlanService,
                                AuthService authService) {
        this.examGuideService = examGuideService;
        this.preparePlanService = preparePlanService;
        this.authService = authService;
    }

    /** One exam's current-cycle guide. Personalized (document readiness) when signed in, public otherwise. */
    @GetMapping("/api/exams/{examCode}/guide")
    public ExamGuideResponse getGuide(@PathVariable String examCode,
                                       @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        return examGuideService.getGuideForExam(examCode, tryResolveUser(authorization));
    }

    /** Every active exam's current-cycle guide in one response — what mobile syncs. */
    @GetMapping("/api/exam-guides")
    public List<ExamGuideResponse> getAllGuides(
            @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        return examGuideService.getAllGuidesForActiveExams(tryResolveUser(authorization));
    }

    /** Every past (non-current) cycle for this exam — spec §63 "Notification History". */
    @GetMapping("/api/exams/{examCode}/recruitment-cycles/history")
    public List<RecruitmentCycleHistoryEntry> getCycleHistory(@PathVariable String examCode) {
        return examGuideService.getCycleHistory(examCode);
    }

    /** Field-level diff against the previous published cycle — spec §30 "What's Changed This Year". */
    @GetMapping("/api/exams/{examCode}/recruitment-cycles/{cycleId}/changes-from-previous")
    public CycleComparisonResponse getChangesFromPrevious(
            @PathVariable String examCode, @PathVariable UUID cycleId) {
        return examGuideService.getChangesFromPrevious(examCode, cycleId);
    }

    /**
     * Spec §22 "Personalized Preparation Roadmap" — an ordered study checklist, built as an
     * enhancement to Prepare rather than a new "Roadmap" module (see PreparePlanService's own
     * comment). Public like the guide itself; signed-in callers additionally get their real
     * mastery state per topic instead of every topic reading as "not started".
     */
    @GetMapping("/api/exams/{examCode}/prepare-plan")
    public PreparePlanResponse getPreparePlan(@PathVariable String examCode,
                                               @RequestHeader(value = HttpHeaders.AUTHORIZATION, required = false) String authorization) {
        return preparePlanService.getPreparePlan(examCode, tryResolveUser(authorization));
    }

    /** Marks one document Ready/Missing/Not-Applicable for the signed-in user (spec §11). */
    @PutMapping("/api/user/documents/{documentRequirementId}/status")
    public ResponseEntity<Void> setDocumentStatus(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                   @PathVariable UUID documentRequirementId,
                                                   @Valid @RequestBody UserDocumentStatusRequest request) {
        User user = authService.requireUser(authorization);
        examGuideService.setDocumentStatus(user, documentRequirementId, request.status());
        return ResponseEntity.noContent().build();
    }

    /**
     * The guide reads are public, so simply having no Authorization header must not be
     * treated as an error — it means "browsing anonymously", and every document's
     * userStatus is then null. A header that IS present but invalid/expired still throws
     * (via requireUser below), on purpose: silently degrading that case to anonymous
     * would mask a real bug — a token that should have worked — as an empty
     * personalization instead of a visible 401.
     */
    private User tryResolveUser(String authorization) {
        if (authorization == null || authorization.isBlank()) {
            return null;
        }
        return authService.requireUser(authorization);
    }
}
