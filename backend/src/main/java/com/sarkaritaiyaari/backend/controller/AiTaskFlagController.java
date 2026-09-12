package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.AiTaskFlagDtos.AiTaskFlagListResponse;
import com.sarkaritaiyaari.backend.dto.AiTaskFlagDtos.AiTaskFlagView;
import com.sarkaritaiyaari.backend.dto.AiTaskFlagDtos.UpdateAiTaskFlagRequest;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.service.AiTaskFlagService;
import com.sarkaritaiyaari.backend.service.AuthService;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * TASK-2701 Phase 4 — admin control over which AI tasks are switched on. Every method is
 * {@code requireAdmin}: enabling/disabling an AI capability app-wide is the same class of
 * decision as generation itself (§ AiContentController), not a reviewer-level action.
 */
@RestController
@RequestMapping("/api/admin/ai-task-flags")
public class AiTaskFlagController {

    private final AiTaskFlagService service;
    private final AuthService authService;

    public AiTaskFlagController(AiTaskFlagService service, AuthService authService) {
        this.service = service;
        this.authService = authService;
    }

    @GetMapping
    public AiTaskFlagListResponse list(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        authService.requireAdmin(authorization);
        return new AiTaskFlagListResponse(service.listFlags());
    }

    @PutMapping("/{taskId}")
    public AiTaskFlagView update(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                  @PathVariable String taskId,
                                  @RequestBody UpdateAiTaskFlagRequest request) {
        User admin = authService.requireAdmin(authorization);
        return service.setFlag(admin, taskId, request.enabled(), request.expectedVersion());
    }
}
