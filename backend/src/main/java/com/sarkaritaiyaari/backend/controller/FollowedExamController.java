package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.FollowedExamDtos;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.FollowedExamService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** A student's own followed exams. Mirrors {@link BookmarkController} exactly. */
@RestController
@RequestMapping("/api/followed-exams")
public class FollowedExamController {

    private final AuthService authService;
    private final FollowedExamService followedExamService;

    public FollowedExamController(AuthService authService, FollowedExamService followedExamService) {
        this.authService = authService;
        this.followedExamService = followedExamService;
    }

    /** Upload whatever changed locally since the last sync. Safe to retry. */
    @PostMapping("/sync")
    public FollowedExamDtos.SyncResponse sync(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                               @Valid @RequestBody FollowedExamDtos.SyncRequest request) {
        return followedExamService.upload(authService.requireUser(authorization), request);
    }

    /** Everything currently followed, for rebuilding a fresh install. */
    @GetMapping
    public FollowedExamDtos.RestoreResponse restore(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        return followedExamService.restore(authService.requireUser(authorization));
    }
}
