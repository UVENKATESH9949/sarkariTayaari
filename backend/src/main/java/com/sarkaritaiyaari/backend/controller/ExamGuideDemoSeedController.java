package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.ExamGuideDemoSeeder;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Seeds and removes the demo SSC CGL recruitment cycle. Same two-gate shape as
 * {@code SyntheticCurationController} (admin token + a disabled-by-default flag) and the
 * same reasoning: neither gate is sufficient alone.
 */
@RestController
@RequestMapping("/api/admin/exam-guide-demo")
public class ExamGuideDemoSeedController {

    private final AuthService authService;
    private final ExamGuideDemoSeeder seeder;

    public ExamGuideDemoSeedController(AuthService authService, ExamGuideDemoSeeder seeder) {
        this.authService = authService;
        this.seeder = seeder;
    }

    @GetMapping("/status")
    public Map<String, Object> status(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        authService.requireAdmin(authorization);
        return Map.of("enabled", seeder.isEnabled());
    }

    @PostMapping("/seed")
    public Map<String, Object> seed(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        authService.requireAdmin(authorization);
        return seeder.seed();
    }

    @PostMapping("/purge")
    public Map<String, Object> purge(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        authService.requireAdmin(authorization);
        return seeder.purge();
    }
}
