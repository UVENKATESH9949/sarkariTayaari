package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.DailyPlanDtos.DailyPlanResponse;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.DailyPlanService;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;

/**
 * What the calling student should do today (TASK-3301, Phase 5 — see {@code api/DAILY-PLAN.md}).
 *
 * <p>Mounted under {@code /api/me/} with the acting user from the token, like every other
 * personalization endpoint.
 *
 * <p>{@code zone} matters more here than anywhere else in this program: "today" is not a global
 * fact, and a plan is assigned to a calendar day. An unknown zone is a 400 rather than a silent
 * fallback to UTC, which would quietly plan a different day than the student is living in — the
 * same rule {@code /api/me/analytics} already applies to its day-bounded figures.
 *
 * <p><b>This GET writes.</b> The first read of a given day generates and persists that day's tasks;
 * later reads return the same rows. That is deliberate (D5.2) — re-planning on every read would
 * show a different list to a student who had already started, and would destroy the record of what
 * was originally assigned that Phase 6 depends on.
 */
@RestController
@RequestMapping("/api/me/daily-plan")
public class DailyPlanController {

    private final AuthService authService;
    private final DailyPlanService dailyPlan;

    public DailyPlanController(AuthService authService, DailyPlanService dailyPlan) {
        this.authService = authService;
        this.dailyPlan = dailyPlan;
    }

    @GetMapping
    public DailyPlanResponse plan(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                  @RequestParam String examCode,
                                  @RequestParam(required = false) String zone) {
        User user = authService.requireUser(authorization);
        return dailyPlan.planFor(user, examCode, zone, OffsetDateTime.now());
    }
}
