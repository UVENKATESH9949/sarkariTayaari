package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.WeaknessRadarDtos.WeaknessRadarResponse;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.WeaknessRadarService;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * A student's Preparation Radar for one exam (Weakness Radar v1 — see
 * {@code api/WEAKNESS-RADAR.md}).
 *
 * <p>Mounted under {@code /api/exams/{code}/...} alongside
 * {@link TopicIntelligenceController} and the Exam Guide's prepare-plan, for the same reason:
 * priority and question availability are per-exam, so the radar is meaningless without one and
 * the path should say so.
 *
 * <p><strong>User-scoped, unlike its neighbours under this path.</strong> Every other endpoint
 * on {@code /api/exams/{code}} is public because it exposes only published content; this one
 * reads a specific student's practice history, so it requires a token and takes the acting
 * user from it — never from a path or body parameter, matching every other endpoint in
 * {@code api/USER-PROGRESS.md}.
 */
@RestController
@RequestMapping("/api/exams/{examCode}/weakness-radar")
public class WeaknessRadarController {

    private final AuthService authService;
    private final WeaknessRadarService radar;

    public WeaknessRadarController(AuthService authService, WeaknessRadarService radar) {
        this.authService = authService;
        this.radar = radar;
    }

    /**
     * The whole radar: overview plus full per-topic detail.
     *
     * <p>One payload rather than a list endpoint plus a detail endpoint. The detail screen then
     * works offline from the same cached response, and at this catalogue size (a syllabus is
     * tens of topics, not thousands) a second round trip would buy nothing.
     *
     * <p>Recomputes first if the student has practised since the cache was written — so a GET
     * here can write. That is deliberate and is the whole freshness mechanism; see
     * {@code TopicHealthService.healthForUser} for why not a scheduler.
     */
    @GetMapping
    public WeaknessRadarResponse radar(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                        @PathVariable String examCode) {
        return radar.radarFor(authService.requireUser(authorization), examCode, false);
    }

    /**
     * Forces a recompute, then returns the radar.
     *
     * <p>For pull-to-refresh and for the moment just after a progress upload, where the client
     * knows something changed and should not have to wait for the staleness check to notice.
     * Idempotent — recomputing twice produces the same rows, since the inputs are immutable
     * history.
     */
    @PostMapping("/recompute")
    public WeaknessRadarResponse recompute(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                            @PathVariable String examCode) {
        return radar.radarFor(authService.requireUser(authorization), examCode, true);
    }
}
