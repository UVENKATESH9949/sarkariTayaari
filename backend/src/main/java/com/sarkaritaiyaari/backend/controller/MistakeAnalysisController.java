package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.ai.feedback.MistakeAnalysisValidation;
import com.sarkaritaiyaari.backend.ai.feedback.PersonalNarrativeService;
import com.sarkaritaiyaari.backend.dto.MistakeAnalysisDtos.MistakeAnalysisRequest;
import com.sarkaritaiyaari.backend.dto.MistakeAnalysisDtos.MistakeAnalysisResponse;
import com.sarkaritaiyaari.backend.service.AuthService;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * TASK-2701 Phase 7.4 -- {@code MISTAKE_ANALYSIS} for one question a student got wrong.
 *
 * <p>A separate controller from {@link SessionFeedbackController} for the same reason that one is
 * separate from {@code MockAttemptFeedbackController}: these are different resources with
 * different path roots, and this backend already keeps one controller per resource rather than
 * one "AI" controller accumulating every task.
 *
 * <p>{@code questionId} is in the path because the analysis is <em>about</em> that question, and
 * it is what the client caches the result against. Nothing is persisted server-side (see
 * {@link PersonalNarrativeService#mistakeAnalysis} for why), so unlike
 * {@code SessionFeedbackController} there is no opportunistic write-back here.
 *
 * <p>Requires a signed-in user even though nothing is stored: the request body carries that
 * student's own accuracy and mistake history, so this is not an anonymous surface.
 */
@RestController
@RequestMapping("/api/questions/{questionId}/mistake-analysis")
public class MistakeAnalysisController {

    private final AuthService authService;
    private final PersonalNarrativeService narrativeService;

    public MistakeAnalysisController(AuthService authService, PersonalNarrativeService narrativeService) {
        this.authService = authService;
        this.narrativeService = narrativeService;
    }

    @PostMapping
    public MistakeAnalysisResponse generate(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                             @PathVariable String questionId,
                                             @RequestBody MistakeAnalysisRequest request) {
        authService.requireUser(authorization);

        MistakeAnalysisValidation.Ok analysis = narrativeService.mistakeAnalysis(request);
        if (analysis == null) {
            return MistakeAnalysisResponse.empty();
        }
        return new MistakeAnalysisResponse(
                analysis.mistakeType(), analysis.explanation(), analysis.suggestedAction());
    }
}
