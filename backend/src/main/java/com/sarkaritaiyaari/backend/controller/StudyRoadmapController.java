package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.StudyRoadmapDtos.StudyRoadmapResponse;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.StudyRoadmapService;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;

/**
 * The calling student's study roadmap (TASK-3101, Phase 4 — see {@code api/STUDY-ROADMAP.md}).
 *
 * <h2>Scoping</h2>
 * Mounted under {@code /api/me/} for the same reason as {@code /api/me/learning-state} and
 * {@code /api/me/analytics}: it describes the caller and nobody else, the acting user comes from
 * the bearer token, and there is no user-id parameter anywhere.
 *
 * <h2>Why this does not replace {@code /api/exams/{code}/prepare-plan}</h2>
 * That endpoint has a live consumer — mobile's Exam Guide screen renders its top five items — and
 * answers a narrower question (an ordered checklist, no workload, available signed out). This is an
 * additional, richer read for a signed-in student, per D3.2. Nothing about the older endpoint
 * changes.
 */
@RestController
@RequestMapping("/api/me/study-roadmap")
public class StudyRoadmapController {

    private final AuthService authService;
    private final StudyRoadmapService roadmap;

    public StudyRoadmapController(AuthService authService, StudyRoadmapService roadmap) {
        this.authService = authService;
        this.roadmap = roadmap;
    }

    @GetMapping
    public StudyRoadmapResponse roadmap(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @RequestParam String examCode) {
        User user = authService.requireUser(authorization);
        return roadmap.roadmapFor(user, examCode, OffsetDateTime.now());
    }
}
