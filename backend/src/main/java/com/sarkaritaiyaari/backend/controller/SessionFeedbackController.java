package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.ai.feedback.PersonalNarrativeService;
import com.sarkaritaiyaari.backend.dto.SessionFeedbackDtos.SessionFeedbackRequest;
import com.sarkaritaiyaari.backend.dto.SessionFeedbackDtos.SessionFeedbackResponse;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.entity.UserPracticeSession;
import com.sarkaritaiyaari.backend.repository.UserPracticeSessionRepository;
import com.sarkaritaiyaari.backend.service.AuthService;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;

/**
 * TASK-2701 Phase 7.1. Live, per-student {@code SESSION_FEEDBACK} generation -- the first
 * endpoint in this backend that calls {@code AIService} directly, outside the admin
 * batch-generate-then-review pipeline in {@code ai/content/} (see
 * {@link PersonalNarrativeService}'s own doc comment for why that pipeline does not fit here).
 *
 * <p>{@code sessionId} identifies which session the narrative is <em>about</em> and, when that
 * session has already synced to this backend, where the result is opportunistically cached
 * (see {@link #persistIfSessionSynced}) -- generation itself never depends on the session
 * existing here, since a device can ask for feedback before its own sync has run.
 */
@RestController
@RequestMapping("/api/practice-sessions/{sessionId}/feedback")
public class SessionFeedbackController {

    private final AuthService authService;
    private final PersonalNarrativeService narrativeService;
    private final UserPracticeSessionRepository sessionRepository;

    public SessionFeedbackController(AuthService authService,
                                      PersonalNarrativeService narrativeService,
                                      UserPracticeSessionRepository sessionRepository) {
        this.authService = authService;
        this.narrativeService = narrativeService;
        this.sessionRepository = sessionRepository;
    }

    @PostMapping
    public SessionFeedbackResponse generate(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                             @PathVariable String sessionId,
                                             @RequestBody SessionFeedbackRequest request) {
        User user = authService.requireUser(authorization);
        String narrative = narrativeService.sessionFeedback(request);
        persistIfSessionSynced(sessionId, user, narrative);
        return new SessionFeedbackResponse(narrative);
    }

    /**
     * Best-effort: silently does nothing when the session has not synced here yet, or belongs
     * to someone else (the same "wrong/missing id and someone else's id both resolve to empty,
     * never distinguished" ownership check {@code findByIdAndUserId} already documents itself).
     * A missing narrative on this row simply means the device's own local copy is the only one
     * -- never an error, matching {@code groundTruthFallback: null} for this task.
     */
    private void persistIfSessionSynced(String sessionId, User user, String narrative) {
        if (narrative == null) {
            return;
        }
        sessionRepository.findByIdAndUserId(sessionId, user.getId()).ifPresent(session -> {
            session.setFeedbackNarrative(narrative);
            session.setFeedbackGeneratedAt(OffsetDateTime.now());
            sessionRepository.save(session);
        });
    }
}
