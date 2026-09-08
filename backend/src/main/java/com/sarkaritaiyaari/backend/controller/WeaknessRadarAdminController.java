package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.WeaknessRadarDtos.AdminRadarResponse;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.WeaknessRadarService;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Weakness Radar observability for the team (supplied spec §22).
 *
 * <p>Exists for one specific situation §22 names: a student asks "why does the app say I'm
 * weak in this topic?" and someone has to be able to answer from stored evidence rather than
 * by guessing or re-running the scorer. So this returns the full picture — attempt counts,
 * historical versus recent accuracy, PYQ accuracy, consistency, the speed signal's absence,
 * health, confidence, priority, the final state, the recommended action, and the algorithm
 * version that produced all of it.
 *
 * <p>Mounted under {@code /api/admin/} so the path itself says this is not a product surface,
 * the same convention {@code SyntheticCurationController} follows. Admin token required.
 *
 * <p><strong>This reads another person's practice history</strong> — which is exactly why it
 * is admin-gated and read-only, and why it does not exist on the public path. It never
 * triggers a recompute: an admin investigating a complaint needs to see what the student was
 * actually served.
 */
@RestController
@RequestMapping("/api/admin/weakness-radar")
public class WeaknessRadarAdminController {

    private final AuthService authService;
    private final WeaknessRadarService radar;

    public WeaknessRadarAdminController(AuthService authService, WeaknessRadarService radar) {
        this.authService = authService;
        this.radar = radar;
    }

    /**
     * @param email    the student to inspect. An email rather than a user id because that is
     *                 what a support question arrives with.
     * @param examCode which exam's priority and question availability to interpret their
     *                 health against — health itself is exam-independent.
     */
    @GetMapping
    public AdminRadarResponse inspect(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                       @RequestParam String email,
                                       @RequestParam String examCode) {
        authService.requireAdmin(authorization);
        return radar.adminRadarFor(email, examCode);
    }
}
