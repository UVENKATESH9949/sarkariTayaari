package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.controller.AiUsageController.UsageSummaryResponse;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.AiAdminConfigResponse;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.UpdateAiProviderConfigRequest;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.UpdateAiSettingsRequest;
import com.sarkaritaiyaari.backend.dto.AiTaskFlagDtos.UpdateAiTaskFlagRequest;
import com.sarkaritaiyaari.backend.dto.SessionFeedbackDtos.SessionFeedbackRequest;
import com.sarkaritaiyaari.backend.dto.SessionFeedbackDtos.SessionFeedbackResponse;
import com.sarkaritaiyaari.backend.dto.SessionFeedbackDtos.TopicSnapshotDto;
import com.sarkaritaiyaari.backend.entity.AiTaskId;
import com.sarkaritaiyaari.backend.entity.AiUsageRecord;
import com.sarkaritaiyaari.backend.repository.AiProviderConfigRepository;
import com.sarkaritaiyaari.backend.repository.AiSettingsRepository;
import com.sarkaritaiyaari.backend.repository.AiTaskFlagRepository;
import com.sarkaritaiyaari.backend.repository.AiUsageRecordRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TASK-2701 — the DB-backed {@code AIUsageRecorder} that replaced log-line-only tracking, and the
 * admin aggregate that makes AI spend answerable without reading stdout.
 */
class AiUsageTrackingTest extends AbstractIntegrationTest {

    private static final String FIXTURE_PROVIDER = "narrativefixture";

    @Autowired
    private AiUsageRecordRepository usageRepository;

    @Autowired
    private AiTaskFlagRepository aiTaskFlagRepository;

    @Autowired
    private AiSettingsRepository settingsRepository;

    @Autowired
    private AiProviderConfigRepository providerConfigRepository;

    /** Ids this test created, so the shared dev database is left exactly as it was found. */
    private final List<UUID> createdUsageIds = new java.util.ArrayList<>();

    @BeforeEach
    @AfterEach
    void resetState() {
        createdUsageIds.forEach(usageRepository::deleteById);
        createdUsageIds.clear();
        aiTaskFlagRepository.deleteById(AiTaskId.SESSION_FEEDBACK);
        settingsRepository.findById("default").ifPresent(settings -> {
            settings.setEnabled(null);
            settings.setActiveProvider(null);
            settingsRepository.save(settings);
        });
        providerConfigRepository.deleteById(FIXTURE_PROVIDER.toUpperCase(Locale.ROOT));
    }

    private void enableFeedbackThroughFixtureProvider() {
        ResponseEntity<Void> flagUpdate = restTemplate.exchange(
                "/api/admin/ai-task-flags/SESSION_FEEDBACK", HttpMethod.PUT,
                adminAuth(new UpdateAiTaskFlagRequest(true, 0L)), Void.class);
        assertThat(flagUpdate.getStatusCode()).isEqualTo(HttpStatus.OK);

        AiAdminConfigResponse config = restTemplate.exchange(
                "/api/admin/ai/config", HttpMethod.GET, adminAuth(), AiAdminConfigResponse.class).getBody();
        restTemplate.exchange("/api/admin/ai/providers/" + FIXTURE_PROVIDER, HttpMethod.PUT,
                adminAuth(new UpdateAiProviderConfigRequest("fixture-model", "unused-fixture-key", null, 0L)),
                Void.class);
        restTemplate.exchange("/api/admin/ai/settings", HttpMethod.PUT,
                adminAuth(new UpdateAiSettingsRequest(true, FIXTURE_PROVIDER, config.settings().version())),
                Void.class);
    }

    private void generateOneRealFeedbackCall() {
        SessionFeedbackRequest body = new SessionFeedbackRequest(
                "PRACTICE", TEST_EXAM_CODE, 10, 7, 70, "en",
                List.of(new TopicSnapshotDto("t-1", "Percentages", "Quantitative Aptitude",
                        "NEEDS_ATTENTION", 45, "STABLE", List.of("LOW_ACCURACY"))));
        ResponseEntity<SessionFeedbackResponse> response = restTemplate.exchange(
                "/api/practice-sessions/usage-probe/feedback", HttpMethod.POST,
                sharedStudentAuth(body), SessionFeedbackResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().narrative()).isNotNull();
    }

    @Test
    void everyAiCallIsPersistedWithItsTokenCounts() {
        OffsetDateTime startedAt = OffsetDateTime.now().minusSeconds(5);
        enableFeedbackThroughFixtureProvider();
        generateOneRealFeedbackCall();

        List<AiUsageRecord> recorded = usageRepository.findAll().stream()
                .filter(r -> r.getOccurredAt().isAfter(startedAt) && "session-feedback".equals(r.getFeature()))
                .toList();
        recorded.forEach(r -> createdUsageIds.add(r.getId()));

        assertThat(recorded).hasSize(1);
        AiUsageRecord row = recorded.get(0);
        assertThat(row.getStatus()).isEqualTo("success");
        assertThat(row.getProvider()).isEqualTo(FIXTURE_PROVIDER);
        assertThat(row.getTotalTokens()).isEqualTo(row.getInputTokens() + row.getOutputTokens());
        assertThat(row.getTotalTokens()).isGreaterThan(0);
    }

    @Test
    void theAdminSummaryAggregatesByFeature() {
        OffsetDateTime startedAt = OffsetDateTime.now().minusSeconds(5);
        enableFeedbackThroughFixtureProvider();
        generateOneRealFeedbackCall();

        usageRepository.findAll().stream()
                .filter(r -> r.getOccurredAt().isAfter(startedAt) && "session-feedback".equals(r.getFeature()))
                .forEach(r -> createdUsageIds.add(r.getId()));

        // UTC ("...Z"), not the local "+05:30" offset: a "+" in a query string decodes as a space
        // unless percent-encoded, which is exactly the 400 this assertion caught the first time.
        String sinceUtc = startedAt.withOffsetSameInstant(java.time.ZoneOffset.UTC).toString();
        ResponseEntity<UsageSummaryResponse> response = restTemplate.exchange(
                "/api/admin/ai-usage/summary?since=" + sinceUtc, HttpMethod.GET,
                adminAuth(), UsageSummaryResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        UsageSummaryResponse summary = response.getBody();
        assertThat(summary.totalCalls()).isGreaterThanOrEqualTo(1);
        assertThat(summary.totalTokens()).isEqualTo(summary.totalInputTokens() + summary.totalOutputTokens());
        assertThat(summary.byFeature())
                .anySatisfy(f -> assertThat(f.feature()).isEqualTo("session-feedback"));
    }

    @Test
    void theSummaryIsAdminOnly() {
        assertThat(restTemplate.getForEntity("/api/admin/ai-usage/summary", String.class).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);

        assertThat(restTemplate.exchange("/api/admin/ai-usage/summary", HttpMethod.GET,
                sharedStudentAuth(), String.class).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void aMalformedSinceIsRejected() {
        assertThat(restTemplate.exchange("/api/admin/ai-usage/summary?since=not-a-timestamp",
                HttpMethod.GET, adminAuth(), String.class).getStatusCode())
                .isEqualTo(HttpStatus.BAD_REQUEST);
    }
}
