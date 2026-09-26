package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.ai.feedback.PersonalNarrativeService;
import com.sarkaritaiyaari.backend.ai.feedback.PracticeResultInsightValidation;
import com.sarkaritaiyaari.backend.dto.PracticeResultInsightDtos.PracticeResultInsightRequest;
import com.sarkaritaiyaari.backend.dto.PracticeResultInsightDtos.PracticeResultInsightResponse;
import com.sarkaritaiyaari.backend.service.AuthService;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * The Practice Result screen's "AI Feedback" tab — {@code POST /api/practice-sessions/{sessionId}/
 * analysis-feedback}. On-demand, structured interpretation of a session's already-computed
 * deterministic Analytics tab (see {@code PersonalNarrativeService#practiceResultInsight}'s own
 * doc comment for why there is no server-side cache here).
 *
 * <p>{@code sessionId} identifies which session this is about; it is not looked up server-side —
 * generation is driven entirely by the client-supplied analytics payload, the same trust boundary
 * {@link com.sarkaritaiyaari.backend.controller.SessionFeedbackController} already documents for
 * itself. A signed-in student is required (this is a per-student, on-demand generation call, not
 * public content), but the path variable exists purely for URL symmetry with the other Phase 7
 * feedback endpoints and future server-side auditing, not to authorize the request.
 */
@RestController
@RequestMapping("/api/practice-sessions/{sessionId}/analysis-feedback")
public class PracticeResultInsightController {

    private final AuthService authService;
    private final PersonalNarrativeService narrativeService;

    public PracticeResultInsightController(AuthService authService, PersonalNarrativeService narrativeService) {
        this.authService = authService;
        this.narrativeService = narrativeService;
    }

    @PostMapping
    public PracticeResultInsightResponse generate(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                    @PathVariable String sessionId,
                                                    @RequestBody PracticeResultInsightRequest request) {
        authService.requireUser(authorization);

        PracticeResultInsightValidation.Ok result = narrativeService.practiceResultInsight(request);
        if (result == null) {
            return PracticeResultInsightResponse.empty();
        }
        return new PracticeResultInsightResponse(
                result.summary(), result.strengths(), result.weakAreas(),
                result.timeInsight(), result.recommendation(), result.recommendedAction());
    }
}
