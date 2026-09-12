package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.ai.AIModelInfo;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.AiAdminConfigResponse;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.AiProviderConfigView;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.AiSettingsView;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.AuditLogEntryView;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.TestConnectionRequest;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.TestConnectionResponse;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.UpdateAiProviderConfigRequest;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.UpdateAiSettingsRequest;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.service.AiConfigurationService;
import com.sarkaritaiyaari.backend.service.AuthService;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * AI Admin Control Center — lets an authorized admin manage AI provider configuration
 * from the Admin console with no backend redeploy. Every method is admin-gated; nothing
 * here is reachable by a signed-in student, and no response ever carries a plaintext
 * API key. See {@code AiConfigurationService}'s class doc for the full design.
 */
@RestController
@RequestMapping("/api/admin/ai")
public class AiConfigurationController {

    private final AiConfigurationService configurationService;
    private final AuthService authService;

    public AiConfigurationController(AiConfigurationService configurationService, AuthService authService) {
        this.configurationService = configurationService;
        this.authService = authService;
    }

    @GetMapping("/config")
    public AiAdminConfigResponse getConfig(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        authService.requireAdmin(authorization);
        return configurationService.getAdminConfig();
    }

    @PutMapping("/settings")
    public AiSettingsView updateSettings(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                          @RequestBody UpdateAiSettingsRequest request) {
        User admin = authService.requireAdmin(authorization);
        return configurationService.updateSettings(admin, request);
    }

    @PutMapping("/providers/{providerId}")
    public AiProviderConfigView updateProviderConfig(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                       @PathVariable String providerId,
                                                       @RequestBody UpdateAiProviderConfigRequest request) {
        User admin = authService.requireAdmin(authorization);
        return configurationService.updateProviderConfig(admin, providerId, request);
    }

    @PostMapping("/providers/{providerId}/test-connection")
    public TestConnectionResponse testConnection(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                  @PathVariable String providerId,
                                                  @RequestBody(required = false) TestConnectionRequest request) {
        User admin = authService.requireAdmin(authorization);
        TestConnectionRequest safeRequest = request != null ? request : new TestConnectionRequest(null, null, null);
        return configurationService.testConnection(admin, providerId, safeRequest);
    }

    /** Passthrough to the already-built {@code AIProvider.listModels()} (Phase 1) — lets
     * the admin UI populate a model dropdown without hardcoding any provider's model
     * names (§10). */
    @GetMapping("/providers/{providerId}/models")
    public List<AIModelInfo> getProviderModels(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                                @PathVariable String providerId) {
        authService.requireAdmin(authorization);
        return configurationService.listModels(providerId);
    }

    @GetMapping("/audit-log")
    public List<AuditLogEntryView> getAuditLog(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        authService.requireAdmin(authorization);
        return configurationService.getAuditLog();
    }
}
