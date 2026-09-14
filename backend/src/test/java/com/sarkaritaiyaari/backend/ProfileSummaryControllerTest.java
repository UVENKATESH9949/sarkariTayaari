package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.AiAdminConfigResponse;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.UpdateAiProviderConfigRequest;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.UpdateAiSettingsRequest;
import com.sarkaritaiyaari.backend.dto.AiTaskFlagDtos.UpdateAiTaskFlagRequest;
import com.sarkaritaiyaari.backend.dto.ProfileSummaryDtos.ProfileSummaryRequest;
import com.sarkaritaiyaari.backend.dto.SessionFeedbackDtos.SessionFeedbackResponse;
import com.sarkaritaiyaari.backend.dto.SessionFeedbackDtos.TopicSnapshotDto;
import com.sarkaritaiyaari.backend.entity.AiTaskId;
import com.sarkaritaiyaari.backend.ai.feedback.FixturePersonalNarrativeProvider;
import com.sarkaritaiyaari.backend.repository.AiProviderConfigRepository;
import com.sarkaritaiyaari.backend.repository.AiSettingsRepository;
import com.sarkaritaiyaari.backend.repository.AiTaskFlagRepository;
import com.sarkaritaiyaari.backend.repository.UserProfileSummaryRepository;
import com.sarkaritaiyaari.backend.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Locale;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TASK-2701 Phase 7.3 — the {@code PROFILE_SUMMARY} counterpart to
 * {@code SessionFeedbackControllerTest}. No persistence to verify here (a profile summary has no
 * server-side cache — see {@code ProfileSummaryController}'s own doc comment), so this covers
 * auth, flag-gating, and grounded generation only.
 */
class ProfileSummaryControllerTest extends AbstractIntegrationTest {

    private static final String FIXTURE_PROVIDER = "narrativefixture";

    @Autowired
    private AiTaskFlagRepository aiTaskFlagRepository;

    @Autowired
    private AiSettingsRepository settingsRepository;

    @Autowired
    private AiProviderConfigRepository providerConfigRepository;

    @Autowired
    private UserProfileSummaryRepository profileSummaryRepository;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private FixturePersonalNarrativeProvider fixtureProvider;

    @BeforeEach
    @AfterEach
    void resetState() {
        userRepository.findByEmail(TEST_STUDENT_EMAIL)
                .ifPresent(student -> profileSummaryRepository.deleteById(student.getId() + ":" + TEST_EXAM_CODE));
        fixtureProvider.resetGenerateCount();
        aiTaskFlagRepository.deleteById(AiTaskId.PROFILE_SUMMARY);
        settingsRepository.findById("default").ifPresent(settings -> {
            settings.setEnabled(null);
            settings.setActiveProvider(null);
            settingsRepository.save(settings);
        });
        providerConfigRepository.deleteById(FIXTURE_PROVIDER.toUpperCase(Locale.ROOT));
    }

    private void enableProfileSummaryFlag() {
        ResponseEntity<Void> flagUpdate = restTemplate.exchange(
                "/api/admin/ai-task-flags/PROFILE_SUMMARY", HttpMethod.PUT,
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

    private ProfileSummaryRequest sampleRequestBody() {
        return new ProfileSummaryRequest(
                TEST_EXAM_CODE, "BUILDING", 61, 23,
                List.of(new TopicSnapshotDto("t-strong", "Geometry", "Quantitative Aptitude",
                        "STRONG", 82, "STABLE", List.of())),
                List.of(new TopicSnapshotDto("t-weak", "Percentages", "Quantitative Aptitude",
                        "NEEDS_ATTENTION", 45, "STABLE", List.of("LOW_ACCURACY"))),
                "en");
    }

    @Test
    void requiresAuthentication() {
        ResponseEntity<SessionFeedbackResponse> response = restTemplate.postForEntity(
                "/api/exams/" + TEST_EXAM_CODE + "/profile-summary", sampleRequestBody(),
                SessionFeedbackResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void returnsNullNarrativeWhenTheFlagIsOff() {
        // Deliberately not calling enableProfileSummaryFlag() — "unknown means off" by default.
        ResponseEntity<SessionFeedbackResponse> response = restTemplate.exchange(
                "/api/exams/" + TEST_EXAM_CODE + "/profile-summary", HttpMethod.POST,
                sharedStudentAuth(sampleRequestBody()), SessionFeedbackResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().narrative()).isNull();
    }

    @Test
    void generatesAGroundedNarrativeWhenEnabled() {
        enableProfileSummaryFlag();
        enableFixtureProvider();

        ResponseEntity<SessionFeedbackResponse> response = restTemplate.exchange(
                "/api/exams/" + TEST_EXAM_CODE + "/profile-summary", HttpMethod.POST,
                sharedStudentAuth(sampleRequestBody()), SessionFeedbackResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        String narrative = response.getBody().narrative();
        assertThat(narrative).isNotNull();
        assertThat(narrative).contains("23");
        // The fixture provider extracts the *first* topic line in the prompt, and the prompt
        // template lists strengths before weaknesses — so this is "Geometry", not "Percentages".
        assertThat(narrative).contains("Geometry");
    }

    /**
     * The cache added after real usage measurement showed PROFILE_SUMMARY was ~57% of per-user AI
     * cost purely by regenerating identical narratives (V45__profile_summary_cache.sql). Asserted
     * on a real generation counter, not on the returned text: this fixture is deterministic, so a
     * genuine regeneration would return byte-identical text and be indistinguishable from a hit.
     */
    @Test
    void identicalFactsAreServedFromCacheWithoutSpendingASecondModelCall() {
        enableProfileSummaryFlag();
        enableFixtureProvider();

        String first = postSummary(sampleRequestBody()).getBody().narrative();
        assertThat(first).isNotNull();
        assertThat(fixtureProvider.generateCount()).isEqualTo(1);

        String second = postSummary(sampleRequestBody()).getBody().narrative();
        assertThat(second).isEqualTo(first);
        assertThat(fixtureProvider.generateCount())
                .as("identical facts must not reach the provider a second time")
                .isEqualTo(1);
    }

    /** The other half of the same contract: a cache that never misses would be serving stale
     *  narratives, so a real change in the facts has to regenerate. */
    @Test
    void changedFactsRegenerateRatherThanServingAStaleNarrative() {
        enableProfileSummaryFlag();
        enableFixtureProvider();

        postSummary(sampleRequestBody());
        assertThat(fixtureProvider.generateCount()).isEqualTo(1);

        // One more topic practised — a fact a narrative is allowed to cite, so the hash moves.
        ProfileSummaryRequest moved = new ProfileSummaryRequest(
                TEST_EXAM_CODE, "BUILDING", 61, 24,
                sampleRequestBody().strengths(), sampleRequestBody().weaknesses(), "en");

        assertThat(postSummary(moved).getBody().narrative()).isNotNull();
        assertThat(fixtureProvider.generateCount())
                .as("changed facts must regenerate")
                .isEqualTo(2);
    }

    private ResponseEntity<SessionFeedbackResponse> postSummary(ProfileSummaryRequest body) {
        return restTemplate.exchange(
                "/api/exams/" + TEST_EXAM_CODE + "/profile-summary", HttpMethod.POST,
                sharedStudentAuth(body), SessionFeedbackResponse.class);
    }
}
