package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.AiAdminConfigResponse;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.AiProviderConfigView;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.AiSettingsView;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.AuditLogEntryView;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.TestConnectionRequest;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.TestConnectionResponse;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.UpdateAiProviderConfigRequest;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.UpdateAiSettingsRequest;
import com.sarkaritaiyaari.backend.entity.AiProviderConfig;
import com.sarkaritaiyaari.backend.entity.AiSettings;
import com.sarkaritaiyaari.backend.repository.AiConfigAuditLogRepository;
import com.sarkaritaiyaari.backend.repository.AiProviderConfigRepository;
import com.sarkaritaiyaari.backend.repository.AiSettingsRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AI Admin Control Center. Every assertion that touches a real API key checks the raw
 * response body/DB value directly — not just the DTO shape — since "never returns a
 * plaintext key" is this feature's single most important property (§21 of the brief).
 */
class AiConfigurationTest extends AbstractIntegrationTest {

    private static final String RAW_TEST_API_KEY = "sk-ant-test-key-should-never-leak-anywhere";

    @Autowired
    private AiSettingsRepository settingsRepository;

    @Autowired
    private AiProviderConfigRepository providerConfigRepository;

    @Autowired
    private AiConfigAuditLogRepository auditLogRepository;

    @BeforeEach
    @AfterEach
    void resetAiConfigState() {
        settingsRepository.findById("default").ifPresent(settings -> {
            settings.setEnabled(null);
            settings.setActiveProvider(null);
            settingsRepository.save(settings);
        });
        providerConfigRepository.deleteAllById(List.of("MOCK", "CLAUDE"));
        auditLogRepository.deleteByChangedByEmail(TEST_ADMIN_EMAIL);
    }

    @Test
    void getConfig_rejectsAnonymousAndNonAdminCallers() {
        ResponseEntity<Map> anonymous = restTemplate.getForEntity("/api/admin/ai/config", Map.class);
        assertThat(anonymous.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);

        ResponseEntity<Map> asStudent = restTemplate.exchange(
                "/api/admin/ai/config", HttpMethod.GET, sharedStudentAuth(), Map.class);
        assertThat(asStudent.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void getConfig_asAdmin_listsOnlyRegisteredProvidersAndNeverAKey() {
        ResponseEntity<AiAdminConfigResponse> response = restTemplate.exchange(
                "/api/admin/ai/config", HttpMethod.GET, adminAuth(), AiAdminConfigResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        AiAdminConfigResponse body = response.getBody();
        assertThat(body.availableProviders()).contains("CLAUDE", "MOCK");
        assertThat(body.availableProviders()).doesNotContain("OPENAI", "GEMINI");
        assertThat(response.toString()).doesNotContain(RAW_TEST_API_KEY);
    }

    @Test
    void updateSettings_enablingMock_needsNoApiKey() {
        long version = currentSettingsVersion();

        ResponseEntity<AiSettingsView> response = restTemplate.exchange(
                "/api/admin/ai/settings", HttpMethod.PUT,
                adminAuth(new UpdateAiSettingsRequest(true, "MOCK", version)), AiSettingsView.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().enabled()).isTrue();
        assertThat(response.getBody().activeProvider()).isEqualTo("MOCK");
    }

    @Test
    void updateSettings_enablingClaudeWithNoKeyAnywhere_isRejected() {
        long version = currentSettingsVersion();

        ResponseEntity<Map> response = restTemplate.exchange(
                "/api/admin/ai/settings", HttpMethod.PUT,
                adminAuth(new UpdateAiSettingsRequest(true, "CLAUDE", version)), Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(response.getBody().get("error").toString()).contains("no API key is configured");
    }

    @Test
    void updateSettings_enablingClaudeAfterSavingAKey_succeeds() {
        saveClaudeApiKey();
        long version = currentSettingsVersion();

        ResponseEntity<AiSettingsView> response = restTemplate.exchange(
                "/api/admin/ai/settings", HttpMethod.PUT,
                adminAuth(new UpdateAiSettingsRequest(true, "CLAUDE", version)), AiSettingsView.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().enabled()).isTrue();
    }

    @Test
    void updateSettings_staleExpectedVersion_isRejectedWithConflict() {
        long staleVersion = currentSettingsVersion();

        ResponseEntity<AiSettingsView> first = restTemplate.exchange(
                "/api/admin/ai/settings", HttpMethod.PUT,
                adminAuth(new UpdateAiSettingsRequest(true, "MOCK", staleVersion)), AiSettingsView.class);
        assertThat(first.getStatusCode()).isEqualTo(HttpStatus.OK);

        ResponseEntity<Map> second = restTemplate.exchange(
                "/api/admin/ai/settings", HttpMethod.PUT,
                adminAuth(new UpdateAiSettingsRequest(false, "MOCK", staleVersion)), Map.class);

        assertThat(second.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void updateProviderConfig_encryptsTheKeyAtRest_andNeverReturnsItInAnyResponse() {
        ResponseEntity<AiProviderConfigView> response = restTemplate.exchange(
                "/api/admin/ai/providers/CLAUDE", HttpMethod.PUT,
                adminAuth(new UpdateAiProviderConfigRequest("claude-sonnet-5", RAW_TEST_API_KEY, null, 0)),
                AiProviderConfigView.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().configured()).isTrue();
        assertThat(response.toString()).doesNotContain(RAW_TEST_API_KEY);

        AiProviderConfig stored = providerConfigRepository.findById("CLAUDE").orElseThrow();
        assertThat(stored.getEncryptedApiKey()).isNotNull();
        assertThat(stored.getEncryptedApiKey()).doesNotContain(RAW_TEST_API_KEY);
        assertThat(stored.getEncryptedApiKey()).isNotEqualTo(RAW_TEST_API_KEY);

        ResponseEntity<AiAdminConfigResponse> fullConfig = restTemplate.exchange(
                "/api/admin/ai/config", HttpMethod.GET, adminAuth(), AiAdminConfigResponse.class);
        assertThat(fullConfig.toString()).doesNotContain(RAW_TEST_API_KEY);
    }

    @Test
    void updateProviderConfig_blankApiKey_leavesExistingKeyUnchanged() {
        saveClaudeApiKey();
        AiProviderConfig afterFirstSave = providerConfigRepository.findById("CLAUDE").orElseThrow();
        String encryptedAfterFirstSave = afterFirstSave.getEncryptedApiKey();
        long version = afterFirstSave.getVersion();

        ResponseEntity<AiProviderConfigView> response = restTemplate.exchange(
                "/api/admin/ai/providers/CLAUDE", HttpMethod.PUT,
                adminAuth(new UpdateAiProviderConfigRequest("claude-opus-5", null, null, version)),
                AiProviderConfigView.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().model()).isEqualTo("claude-opus-5");
        AiProviderConfig afterSecondSave = providerConfigRepository.findById("CLAUDE").orElseThrow();
        assertThat(afterSecondSave.getEncryptedApiKey()).isEqualTo(encryptedAfterFirstSave);
    }

    @Test
    void updateProviderConfig_unknownProvider_isRejected() {
        ResponseEntity<Map> response = restTemplate.exchange(
                "/api/admin/ai/providers/OPENAI", HttpMethod.PUT,
                adminAuth(new UpdateAiProviderConfigRequest(null, "some-key", null, 0)), Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void testConnection_againstMock_succeedsWithoutAnyNetworkCall() {
        ResponseEntity<TestConnectionResponse> response = restTemplate.exchange(
                "/api/admin/ai/providers/MOCK/test-connection", HttpMethod.POST,
                adminAuth(new TestConnectionRequest(null, null, null)), TestConnectionResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().success()).isTrue();
        assertThat(response.getBody().provider()).isEqualTo("MOCK");
        assertThat(response.getBody().latencyMs()).isLessThan(1000L);
    }

    @Test
    void testConnection_unregisteredProvider_failsCleanly() {
        ResponseEntity<Map> response = restTemplate.exchange(
                "/api/admin/ai/providers/OPENAI/test-connection", HttpMethod.POST,
                adminAuth(new TestConnectionRequest(null, null, null)), Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.SERVICE_UNAVAILABLE);
    }

    @Test
    void auditLog_recordsChanges_butNeverTheKeyValue() {
        saveClaudeApiKey();
        long version = currentSettingsVersion();
        restTemplate.exchange("/api/admin/ai/settings", HttpMethod.PUT,
                adminAuth(new UpdateAiSettingsRequest(true, "CLAUDE", version)), AiSettingsView.class);
        restTemplate.exchange("/api/admin/ai/providers/MOCK/test-connection", HttpMethod.POST,
                adminAuth(new TestConnectionRequest(null, null, null)), TestConnectionResponse.class);

        ResponseEntity<AuditLogEntryView[]> response = restTemplate.exchange(
                "/api/admin/ai/audit-log", HttpMethod.GET, adminAuth(), AuditLogEntryView[].class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<AuditLogEntryView> entries = List.of(response.getBody());
        assertThat(entries).extracting(AuditLogEntryView::action)
                .contains("PROVIDER_CONFIG_UPDATED", "AI_ENABLED", "ACTIVE_PROVIDER_CHANGED", "TEST_CONNECTION");
        assertThat(response.toString()).doesNotContain(RAW_TEST_API_KEY);
        entries.forEach(entry -> assertThat(entry.summary()).doesNotContain(RAW_TEST_API_KEY));
    }

    /* -------------------------------------------------------------------------- helpers */

    private long currentSettingsVersion() {
        return settingsRepository.findById("default").map(AiSettings::getVersion).orElse(0L);
    }

    private void saveClaudeApiKey() {
        restTemplate.exchange("/api/admin/ai/providers/CLAUDE", HttpMethod.PUT,
                adminAuth(new UpdateAiProviderConfigRequest("claude-sonnet-5", RAW_TEST_API_KEY, null, 0)),
                AiProviderConfigView.class);
    }
}
