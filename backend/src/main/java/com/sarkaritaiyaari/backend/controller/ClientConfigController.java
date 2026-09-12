package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.AiTaskFlagDtos.ClientConfigResponse;
import com.sarkaritaiyaari.backend.service.AiTaskFlagService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * TASK-2701 Phase 4 — the public, unauthenticated client-config feed. This is the channel
 * `AI_ARCHITECTURE.md` §10 and the earlier Phase 0/1 audit found genuinely did not exist
 * anywhere in this backend: no mechanism let a mobile/web client fetch server-side config or
 * feature flags (verified by enumerating every controller, twice).
 *
 * Deliberately named generically (not `/api/ai-client-config`) — today it carries only AI task
 * flags, but the shape (`ClientConfigResponse`) is built to gain sibling sections later without
 * a breaking change, the same way `QuestionResponse` grew new fields across many phases without
 * every consumer needing to change.
 *
 * No auth: a signed-out student's app must be able to fetch this exactly like it fetches
 * questions/exam-structure, per this backend's existing public-content-sync convention
 * (`api/README.md`'s own stated rule).
 */
@RestController
@RequestMapping("/api/client-config")
public class ClientConfigController {

    private final AiTaskFlagService aiTaskFlagService;

    public ClientConfigController(AiTaskFlagService aiTaskFlagService) {
        this.aiTaskFlagService = aiTaskFlagService;
    }

    @GetMapping
    public ClientConfigResponse get() {
        return aiTaskFlagService.clientConfig();
    }
}
