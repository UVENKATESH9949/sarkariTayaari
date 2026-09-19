package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.RevisionPlanDtos.RevisionPlanResponse;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.RevisionPlanService;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;

/**
 * When the calling student should come back to each topic (TASK-3201, Phase 7 — see
 * {@code api/REVISION-PLAN.md}).
 *
 * <h2>Scoping</h2>
 * Mounted under {@code /api/me/} alongside {@code learning-state} and {@code study-roadmap}: it
 * describes the caller and nobody else, the acting user comes from the bearer token, and there is
 * no user-id parameter anywhere.
 *
 * <h2>Relationship to the roadmap</h2>
 * The roadmap orders work that has not been done; this orders work that has been done and is
 * fading. They are read together by Phase 5, which decides how much of either fits in a day —
 * deliberately not decided here, so that allocation lives in one place rather than two.
 */
@RestController
@RequestMapping("/api/me/revision-plan")
public class RevisionPlanController {

    private final AuthService authService;
    private final RevisionPlanService revisionPlan;

    public RevisionPlanController(AuthService authService, RevisionPlanService revisionPlan) {
        this.authService = authService;
        this.revisionPlan = revisionPlan;
    }

    @GetMapping
    public RevisionPlanResponse revisionPlan(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @RequestParam String examCode) {
        User user = authService.requireUser(authorization);
        return revisionPlan.planFor(user, examCode, OffsetDateTime.now());
    }
}
