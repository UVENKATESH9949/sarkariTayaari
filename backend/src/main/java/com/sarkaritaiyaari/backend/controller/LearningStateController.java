package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.LearningStateDtos.LearningStateResponse;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.LearningStateService;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;

/**
 * The canonical learning state for the calling student (TASK-3001 — see
 * {@code api/LEARNING-STATE.md}).
 *
 * <h2>Scoping</h2>
 * Mounted under {@code /api/me/} for the same reason as {@code /api/me/analytics}: it describes
 * the caller and nobody else, the acting user comes from the bearer token, and there is no
 * user-id parameter anywhere, so one student cannot address another's state.
 *
 * <p>{@code examCode} is required and scopes only the <b>exam-dependent</b> dimensions — priority,
 * curated weightage, question availability and the recommendation. Health and curriculum state are
 * properties of the student and the topic, not of an exam, and come back the same whichever exam
 * is asked for.
 *
 * <h2>Why this is not a new model</h2>
 * Every field here already had an owner. This endpoint names the dimensions and puts them in one
 * place so a planner cannot accidentally read "how much have you studied this" as "how well are
 * you doing at this" — the two were both spelled {@code NEEDS_REVISION} before this contract
 * existed. See {@code LearningStateDtos}' own doc.
 */
@RestController
@RequestMapping("/api/me/learning-state")
public class LearningStateController {

    private final AuthService authService;
    private final LearningStateService learningState;

    public LearningStateController(AuthService authService, LearningStateService learningState) {
        this.authService = authService;
        this.learningState = learningState;
    }

    @GetMapping
    public LearningStateResponse learningState(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @RequestParam String examCode) {
        User user = authService.requireUser(authorization);
        return learningState.stateFor(user, examCode, OffsetDateTime.now());
    }
}
