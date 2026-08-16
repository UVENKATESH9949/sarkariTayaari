package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.ProgressDtos;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.ProgressService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
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
}
