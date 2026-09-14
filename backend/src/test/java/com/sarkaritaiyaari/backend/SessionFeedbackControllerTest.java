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
import com.sarkaritaiyaari.backend.entity.UserPracticeSession;
import com.sarkaritaiyaari.backend.repository.AiProviderConfigRepository;
import com.sarkaritaiyaari.backend.repository.AiSettingsRepository;
import com.sarkaritaiyaari.backend.repository.AiTaskFlagRepository;
import com.sarkaritaiyaari.backend.repository.UserPracticeSessionRepository;
import com.sarkaritaiyaari.backend.repository.UserRepository;
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

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TASK-2701 Phase 7.1 — the first live, per-student AI call in this backend, end to end: flag
 * gating, generation against a real (test-fixture) provider, grounding, and opportunistic
 * persistence onto an already-synced session row. Same "swap in a fake provider under its own
 * bean name" mechanism {@code AiContentIntegrationTest} already exercises, adapted for a
 * narrative-shaped fixture since {@code FixtureAiContentProvider}'s own JSON shape doesn't match
 * this task's payload.
 */
class SessionFeedbackControllerTest extends AbstractIntegrationTest {

    private static final String FIXTURE_PROVIDER = "narrativefixture";
    private static final String SYNCED_SESSION_ID = "sf-test-synced-session";

    @Autowired
    private AiTaskFlagRepository aiTaskFlagRepository;

    @Autowired
    private AiSettingsRepository settingsRepository;

    @Autowired
    private AiProviderConfigRepository providerConfigRepository;

    @Autowired
    private UserPracticeSessionRepository practiceSessionRepository;

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
        practiceSessionRepository.deleteById(SYNCED_SESSION_ID);
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
                "PRACTICE", TEST_EXAM_CODE, 10, 7, 70, "en",
                List.of(new TopicSnapshotDto("t-1", "Percentages", "Quantitative Aptitude",
                        "NEEDS_ATTENTION", 45, "STABLE", List.of("LOW_ACCURACY"))));
    }

    @Test
    void requiresAuthentication() {
        ResponseEntity<SessionFeedbackResponse> response = restTemplate.postForEntity(
                "/api/practice-sessions/" + SYNCED_SESSION_ID + "/feedback", sampleRequestBody(),
                SessionFeedbackResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void returnsNullNarrativeWhenTheFlagIsOff() {
        // Deliberately not calling enableSessionFeedbackFlag() — "unknown means off" by default.
        ResponseEntity<SessionFeedbackResponse> response = restTemplate.exchange(
                "/api/practice-sessions/" + SYNCED_SESSION_ID + "/feedback", HttpMethod.POST,
                sharedStudentAuth(sampleRequestBody()), SessionFeedbackResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().narrative()).isNull();
    }

    @Test
    void generatesAGroundedNarrativeWhenEnabled() {
        enableSessionFeedbackFlag();
        enableFixtureProvider();

        ResponseEntity<SessionFeedbackResponse> response = restTemplate.exchange(
                "/api/practice-sessions/" + SYNCED_SESSION_ID + "/feedback", HttpMethod.POST,
                sharedStudentAuth(sampleRequestBody()), SessionFeedbackResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        String narrative = response.getBody().narrative();
        assertThat(narrative).isNotNull();
        assertThat(narrative).contains("70");
        assertThat(narrative).contains("Percentages");
    }

    @Test
    void doesNotFailWhenNoSessionHasSyncedForThatId() {
        enableSessionFeedbackFlag();
        enableFixtureProvider();

        // No UserPracticeSession row exists for SYNCED_SESSION_ID at this point (cleaned up in
        // resetState) — generation must not depend on the session already existing here.
        ResponseEntity<SessionFeedbackResponse> response = restTemplate.exchange(
                "/api/practice-sessions/" + SYNCED_SESSION_ID + "/feedback", HttpMethod.POST,
                sharedStudentAuth(sampleRequestBody()), SessionFeedbackResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().narrative()).isNotNull();
    }

    @Test
    void persistsTheNarrativeOntoAnAlreadySyncedSession() {
        enableSessionFeedbackFlag();
        enableFixtureProvider();

        User student = userRepository.findByEmail(TEST_STUDENT_EMAIL).orElseThrow();
        UserPracticeSession session = new UserPracticeSession();
        session.setId(SYNCED_SESSION_ID);
        session.setUser(student);
        session.setCompletedAt(OffsetDateTime.now());
        session.setCorrectCount(7);
        session.setTotalCount(10);
        practiceSessionRepository.save(session);

        ResponseEntity<SessionFeedbackResponse> response = restTemplate.exchange(
                "/api/practice-sessions/" + SYNCED_SESSION_ID + "/feedback", HttpMethod.POST,
                sharedStudentAuth(sampleRequestBody()), SessionFeedbackResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        String narrative = response.getBody().narrative();
        assertThat(narrative).isNotNull();

        UserPracticeSession reloaded = practiceSessionRepository.findById(SYNCED_SESSION_ID).orElseThrow();
        assertThat(reloaded.getFeedbackNarrative()).isEqualTo(narrative);
        assertThat(reloaded.getFeedbackGeneratedAt()).isNotNull();
    }
}
