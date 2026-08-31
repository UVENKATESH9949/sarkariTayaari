package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.TopicProgressDtos;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.TopicProgressService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * A student's own per-topic mastery (Epic L / TICKET-2105). Scoped to the caller via the
 * token, exactly like {@link BookmarkController} and {@link ProgressController} — there is
 * no path parameter for the user, so one student cannot ask for another's progress.
 */
@RestController
@RequestMapping("/api/topic-progress")
public class TopicProgressController {

    private final AuthService authService;
    private final TopicProgressService topicProgressService;

    public TopicProgressController(AuthService authService, TopicProgressService topicProgressService) {
        this.authService = authService;
        this.topicProgressService = topicProgressService;
    }

    /** Upload whatever changed locally since the last sync. Safe to retry. */
    @PostMapping("/sync")
    public TopicProgressDtos.SyncResponse sync(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                @Valid @RequestBody TopicProgressDtos.SyncRequest request) {
        return topicProgressService.upload(authService.requireUser(authorization), request);
    }

    /** Everything the server holds for this student, for rebuilding a fresh install. */
    @GetMapping
    public TopicProgressDtos.RestoreResponse restore(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        return topicProgressService.restore(authService.requireUser(authorization));
    }
}
