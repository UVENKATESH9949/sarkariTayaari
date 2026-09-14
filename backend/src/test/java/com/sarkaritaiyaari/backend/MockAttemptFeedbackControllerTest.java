package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.AiAdminConfigResponse;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.UpdateAiProviderConfigRequest;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.UpdateAiSettingsRequest;
import com.sarkaritaiyaari.backend.dto.AiTaskFlagDtos.UpdateAiTaskFlagRequest;
import com.sarkaritaiyaari.backend.dto.SessionFeedbackDtos.SessionFeedbackRequest;
import com.sarkaritaiyaari.backend.dto.SessionFeedbackDtos.SessionFeedbackResponse;
import com.sarkaritaiyaari.backend.dto.SessionFeedbackDtos.TopicSnapshotDto;
import com.sarkaritaiyaari.backend.entity.AiTaskId;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.entity.UserMockAttempt;
import com.sarkaritaiyaari.backend.repository.AiProviderConfigRepository;
import com.sarkaritaiyaari.backend.repository.AiSettingsRepository;
import com.sarkaritaiyaari.backend.repository.AiTaskFlagRepository;
import com.sarkaritaiyaari.backend.repository.UserMockAttemptRepository;
import com.sarkaritaiyaari.backend.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TASK-2701 Phase 7.2 — the Mock Test twin of {@code SessionFeedbackControllerTest} (7.1),
 * proving {@link com.sarkaritaiyaari.backend.controller.MockAttemptFeedbackController} persists
 * onto {@code user_mock_attempts} rather than {@code user_practice_sessions}, sharing the exact
 * same flag-gating/grounding/generation path via {@code PersonalNarrativeService}.
 */
class MockAttemptFeedbackControllerTest extends AbstractIntegrationTest {

    private static final String FIXTURE_PROVIDER = "narrativefixture";
    private static final String SYNCED_ATTEMPT_ID = "sf-test-synced-attempt";

    @Autowired
    private AiTaskFlagRepository aiTaskFlagRepository;

    @Autowired
    private AiSettingsRepository settingsRepository;

    @Autowired
    private AiProviderConfigRepository providerConfigRepository;

    @Autowired
    private UserMockAttemptRepository mockAttemptRepository;

    @Autowired
    private UserRepository userRepository;

    @BeforeEach
    @AfterEach
    void resetState() {
        aiTaskFlagRepository.deleteById(AiTaskId.SESSION_FEEDBACK);
        settingsRepository.findById("default").ifPresent(settings -> {
            settings.setEnabled(null);
            settings.setActiveProvider(null);
            settingsRepository.save(settings);
        });
        providerConfigRepository.deleteById(FIXTURE_PROVIDER.toUpperCase(Locale.ROOT));
        mockAttemptRepository.deleteById(SYNCED_ATTEMPT_ID);
    }

    private void enableSessionFeedbackFlag() {
        ResponseEntity<Void> flagUpdate = restTemplate.exchange(
                "/api/admin/ai-task-flags/SESSION_FEEDBACK", HttpMethod.PUT,
                adminAuth(new UpdateAiTaskFlagRequest(true, 0L)), Void.class);
        assertThat(flagUpdate.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    private void enableFixtureProvider() {
        AiAdminConfigResponse config = restTemplate.exchange(
                "/api/admin/ai/config", HttpMethod.GET, adminAuth(), AiAdminConfigResponse.class).getBody();
        assertThat(config.availableProviders())
                .as("the narrative test fixture provider bean must be picked up by AIProviderRegistry")
                .contains(FIXTURE_PROVIDER.toUpperCase(Locale.ROOT));

        ResponseEntity<Void> providerUpdate = restTemplate.exchange(
                "/api/admin/ai/providers/" + FIXTURE_PROVIDER, HttpMethod.PUT,
                adminAuth(new UpdateAiProviderConfigRequest("fixture-model", "unused-fixture-key", null, 0L)),
                Void.class);
        assertThat(providerUpdate.getStatusCode()).isEqualTo(HttpStatus.OK);

        ResponseEntity<Void> settingsUpdate = restTemplate.exchange(
                "/api/admin/ai/settings", HttpMethod.PUT,
                adminAuth(new UpdateAiSettingsRequest(true, FIXTURE_PROVIDER, config.settings().version())),
                Void.class);
        assertThat(settingsUpdate.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    private SessionFeedbackRequest sampleRequestBody() {
        return new SessionFeedbackRequest(
                "MOCK", TEST_EXAM_CODE, 100, 62, 62, "en", List.of());
    }

    @Test
    void requiresAuthentication() {
        ResponseEntity<SessionFeedbackResponse> response = restTemplate.postForEntity(
                "/api/mock-attempts/" + SYNCED_ATTEMPT_ID + "/feedback", sampleRequestBody(),
                SessionFeedbackResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void returnsNullNarrativeWhenTheFlagIsOff() {
        // Deliberately not calling enableSessionFeedbackFlag() — "unknown means off" by default.
        ResponseEntity<SessionFeedbackResponse> response = restTemplate.exchange(
                "/api/mock-attempts/" + SYNCED_ATTEMPT_ID + "/feedback", HttpMethod.POST,
                sharedStudentAuth(sampleRequestBody()), SessionFeedbackResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().narrative()).isNull();
    }

    @Test
    void generatesAGroundedNarrativeWhenEnabled() {
        enableSessionFeedbackFlag();
        enableFixtureProvider();

        ResponseEntity<SessionFeedbackResponse> response = restTemplate.exchange(
                "/api/mock-attempts/" + SYNCED_ATTEMPT_ID + "/feedback", HttpMethod.POST,
                sharedStudentAuth(sampleRequestBody()), SessionFeedbackResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        String narrative = response.getBody().narrative();
        assertThat(narrative).isNotNull();
        assertThat(narrative).contains("62");
    }

    @Test
    void doesNotFailWhenNoAttemptHasSyncedForThatId() {
        enableSessionFeedbackFlag();
        enableFixtureProvider();

        // No UserMockAttempt row exists for SYNCED_ATTEMPT_ID at this point (cleaned up in
        // resetState) — generation must not depend on the attempt already existing here.
        ResponseEntity<SessionFeedbackResponse> response = restTemplate.exchange(
                "/api/mock-attempts/" + SYNCED_ATTEMPT_ID + "/feedback", HttpMethod.POST,
                sharedStudentAuth(sampleRequestBody()), SessionFeedbackResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().narrative()).isNotNull();
    }

    @Test
    void persistsTheNarrativeOntoAnAlreadySyncedAttempt() {
        enableSessionFeedbackFlag();
        enableFixtureProvider();

        User student = userRepository.findByEmail(TEST_STUDENT_EMAIL).orElseThrow();
        UserMockAttempt attempt = new UserMockAttempt();
        attempt.setId(SYNCED_ATTEMPT_ID);
        attempt.setUser(student);
        attempt.setExamCode(TEST_EXAM_CODE);
        attempt.setExamLabel("Feedback Test Exam");
        attempt.setStartedAt(OffsetDateTime.now().minusMinutes(30));
        attempt.setCompletedAt(OffsetDateTime.now());
        attempt.setDurationSeconds(1800);
        attempt.setTimeTakenSeconds(1500);
        attempt.setMarksCorrect(BigDecimal.valueOf(2));
        attempt.setMarksWrong(BigDecimal.valueOf(0.5));
        attempt.setTotalMarksScored(BigDecimal.valueOf(124));
        attempt.setCorrectCount(62);
        attempt.setWrongCount(38);
        attempt.setUnattemptedCount(0);
        attempt.setTotalQuestions(100);
        mockAttemptRepository.save(attempt);

        ResponseEntity<SessionFeedbackResponse> response = restTemplate.exchange(
                "/api/mock-attempts/" + SYNCED_ATTEMPT_ID + "/feedback", HttpMethod.POST,
                sharedStudentAuth(sampleRequestBody()), SessionFeedbackResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        String narrative = response.getBody().narrative();
        assertThat(narrative).isNotNull();

        UserMockAttempt reloaded = mockAttemptRepository.findById(SYNCED_ATTEMPT_ID).orElseThrow();
        assertThat(reloaded.getFeedbackNarrative()).isEqualTo(narrative);
        assertThat(reloaded.getFeedbackGeneratedAt()).isNotNull();
    }
}
