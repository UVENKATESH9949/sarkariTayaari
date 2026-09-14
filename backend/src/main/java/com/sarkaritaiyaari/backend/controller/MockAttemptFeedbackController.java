package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.ai.feedback.PersonalNarrativeService;
import com.sarkaritaiyaari.backend.dto.SessionFeedbackDtos.SessionFeedbackRequest;
import com.sarkaritaiyaari.backend.dto.SessionFeedbackDtos.SessionFeedbackResponse;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.entity.UserMockAttempt;
import com.sarkaritaiyaari.backend.repository.UserMockAttemptRepository;
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
 * TASK-2701 Phase 7.2 -- the Mock Test twin of {@link SessionFeedbackController} (7.1). Same
 * {@code SESSION_FEEDBACK} task, same {@link PersonalNarrativeService}, same request/response
 * shape -- only the table a result is opportunistically cached onto differs, because Mock Test
 * attempts and Practice sessions live in genuinely separate tables
 * ({@code user_mock_attempts} vs {@code user_practice_sessions}), matching every other place in
 * this backend that keeps the two apart (progress sync, history, etc.) rather than forcing one
 * shared table to carry columns that only apply to one of the two.
 *
 * <p>A dedicated controller rather than branching {@code SessionFeedbackController} on a
 * {@code sessionKind} path segment: the two endpoints already differ in which repository they
 * persist onto, and a single controller juggling two repositories behind one path would need the
 * same branch either way -- two small, obviously-parallel classes are clearer than one with a
 * hidden fork.
 */
@RestController
@RequestMapping("/api/mock-attempts/{attemptId}/feedback")
public class MockAttemptFeedbackController {

    private final AuthService authService;
    private final PersonalNarrativeService narrativeService;
    private final UserMockAttemptRepository attemptRepository;

    public MockAttemptFeedbackController(AuthService authService,
                                          PersonalNarrativeService narrativeService,
                                          UserMockAttemptRepository attemptRepository) {
        this.authService = authService;
        this.narrativeService = narrativeService;
        this.attemptRepository = attemptRepository;
    }

    @PostMapping
    public SessionFeedbackResponse generate(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                             @PathVariable String attemptId,
                                             @RequestBody SessionFeedbackRequest request) {
        User user = authService.requireUser(authorization);
        String narrative = narrativeService.sessionFeedback(request);
        persistIfAttemptSynced(attemptId, user, narrative);
        return new SessionFeedbackResponse(narrative);
    }

    /** Best-effort, identical reasoning to {@code SessionFeedbackController}'s own method of the
     *  same name: silently does nothing when the attempt has not synced here yet, or belongs to
     *  someone else. */
    private void persistIfAttemptSynced(String attemptId, User user, String narrative) {
        if (narrative == null) {
            return;
        }
        attemptRepository.findByIdAndUserId(attemptId, user.getId()).ifPresent(attempt -> {
            attempt.setFeedbackNarrative(narrative);
            attempt.setFeedbackGeneratedAt(OffsetDateTime.now());
            attemptRepository.save(attempt);
        });
    }
}
