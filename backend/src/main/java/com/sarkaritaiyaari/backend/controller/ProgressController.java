package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.ProgressDtos;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.ProgressService;
import jakarta.validation.Valid;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * A student's own history. Every endpoint here is scoped to the caller — the user comes
 * from the token, never from the request body, so one account cannot read or write
 * another's data by guessing an id.
 */
@RestController
@RequestMapping("/api/progress")
public class ProgressController {

    private final AuthService authService;
    private final ProgressService progressService;

    public ProgressController(AuthService authService, ProgressService progressService) {
        this.authService = authService;
        this.progressService = progressService;
    }

    /** Upload whatever the device has not sent yet. Safe to retry. */
    @PostMapping("/sync")
    public ProgressDtos.SyncResponse sync(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                          @Valid @RequestBody ProgressDtos.SyncRequest request) {
        return progressService.upload(authService.requireUser(authorization), request);
    }

    /** Everything this user has, for rebuilding a fresh install. */
    @GetMapping
    public ProgressDtos.RestoreResponse restore(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        return progressService.restore(authService.requireUser(authorization));
    }

    /* ------------------------------------------- Phase 3 (TASK-2601, web history/review) */

    /** Paged, lightweight (no per-question results) — for a browser history list. */
    @GetMapping("/sessions")
    public Page<ProgressDtos.PracticeSessionSummary> listSessions(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return progressService.listSessions(authService.requireUser(authorization), page, size);
    }

    /** Full detail (with results), for a session's own review screen. 404 if unknown or not owned. */
    @GetMapping("/sessions/{id}")
    public ProgressDtos.PracticeSession getSession(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable String id) {
        return progressService.getSession(authService.requireUser(authorization), id);
    }

    /** Paged, lightweight (no per-question results) — for a browser history list. */
    @GetMapping("/attempts")
    public Page<ProgressDtos.MockAttemptSummary> listAttempts(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return progressService.listAttempts(authService.requireUser(authorization), page, size);
    }

    /** Full detail (with results), for an attempt's own review screen. 404 if unknown or not owned. */
    @GetMapping("/attempts/{id}")
    public ProgressDtos.MockAttempt getAttempt(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @PathVariable String id) {
        return progressService.getAttempt(authService.requireUser(authorization), id);
    }

    /** Revise's "Wrong Answers" tab — practice only, see ProgressService's own note on why. */
    @GetMapping("/wrong-answers")
    public Page<ProgressDtos.WrongAnswerRow> listWrongAnswers(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size) {
        return progressService.listWrongAnswers(authService.requireUser(authorization), page, size);
    }
}
