package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.ai.feedback.PersonalNarrativeService;
import com.sarkaritaiyaari.backend.dto.ProfileSummaryDtos.ProfileSummaryRequest;
import com.sarkaritaiyaari.backend.dto.SessionFeedbackDtos.SessionFeedbackResponse;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.service.AuthService;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * TASK-2701 Phase 7.3 -- the {@code PROFILE_SUMMARY} counterpart to
 * {@link SessionFeedbackController}/{@link MockAttemptFeedbackController}, live per-student
 * generation for the Preparation Radar screen's strengths/weaknesses. Path mirrors the existing
 * {@code GET /api/exams/{code}/weakness-radar} convention rather than a resource id, since a
 * profile summary is a snapshot over the whole exam, not one completed session/attempt --
 * there is nothing to opportunistically persist onto (see {@code postProfileSummary}'s own doc
 * comment on the mobile/shared side for why this deliberately has no server-side cache).
 */
@RestController
@RequestMapping("/api/exams/{examCode}/profile-summary")
public class ProfileSummaryController {

    private final AuthService authService;
    private final PersonalNarrativeService narrativeService;

    public ProfileSummaryController(AuthService authService, PersonalNarrativeService narrativeService) {
        this.authService = authService;
        this.narrativeService = narrativeService;
    }

    @PostMapping
    public SessionFeedbackResponse generate(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                             @PathVariable String examCode,
                                             @RequestBody ProfileSummaryRequest request) {
        User user = authService.requireUser(authorization);
        String narrative = narrativeService.profileSummary(user, request);
        return new SessionFeedbackResponse(narrative);
    }
}
