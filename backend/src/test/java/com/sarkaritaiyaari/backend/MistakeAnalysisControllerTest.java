package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.ai.feedback.FixturePersonalNarrativeProvider;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.AiAdminConfigResponse;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.UpdateAiProviderConfigRequest;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.UpdateAiSettingsRequest;
import com.sarkaritaiyaari.backend.dto.AiTaskFlagDtos.UpdateAiTaskFlagRequest;
import com.sarkaritaiyaari.backend.dto.MistakeAnalysisDtos.MistakeAnalysisRequest;
import com.sarkaritaiyaari.backend.dto.MistakeAnalysisDtos.MistakeAnalysisResponse;
import com.sarkaritaiyaari.backend.entity.AiTaskId;
import com.sarkaritaiyaari.backend.repository.AiProviderConfigRepository;
import com.sarkaritaiyaari.backend.repository.AiSettingsRepository;
import com.sarkaritaiyaari.backend.repository.AiTaskFlagRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Locale;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TASK-2701 Phase 7.4 — {@code MISTAKE_ANALYSIS}. The third Phase 7 task and the first whose
 * payload is structured rather than a single narrative, so alongside the shared auth/flag-gating
 * contract this asserts the taxonomy value actually survives the round trip.
 *
 * <p>Nothing is persisted server-side for this task (the client caches it — see
 * {@code PersonalNarrativeService.mistakeAnalysis}), so there is no cache behaviour to verify here,
 * unlike {@code ProfileSummaryControllerTest}.
 */
class MistakeAnalysisControllerTest extends AbstractIntegrationTest {

    private static final String FIXTURE_PROVIDER = "narrativefixture";

    @Autowired
    private AiTaskFlagRepository aiTaskFlagRepository;

    @Autowired
    private AiSettingsRepository settingsRepository;

    @Autowired
    private AiProviderConfigRepository providerConfigRepository;

    @Autowired
    private FixturePersonalNarrativeProvider fixtureProvider;

    @BeforeEach
    @AfterEach
    void resetState() {
        fixtureProvider.resetGenerateCount();
        aiTaskFlagRepository.deleteById(AiTaskId.MISTAKE_ANALYSIS);
        settingsRepository.findById("default").ifPresent(settings -> {
            settings.setEnabled(null);
            settings.setActiveProvider(null);
            settingsRepository.save(settings);
        });
        providerConfigRepository.deleteById(FIXTURE_PROVIDER.toUpperCase(Locale.ROOT));
    }

    private void enableMistakeAnalysisFlag() {
        ResponseEntity<Void> flagUpdate = restTemplate.exchange(
                "/api/admin/ai-task-flags/MISTAKE_ANALYSIS", HttpMethod.PUT,
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

    private MistakeAnalysisRequest sampleRequestBody() {
        return new MistakeAnalysisRequest(
                "A train travels 120 km in 2 hours. What is its average speed?",
                List.of("40 km/h", "50 km/h", "60 km/h", "70 km/h"),
                "60 km/h",
                "50 km/h",
                "Quantitative Aptitude",
                "Speed, Time and Distance",
                "NEEDS_ATTENTION",
                2,
                "en");
    }

    private ResponseEntity<MistakeAnalysisResponse> postAnalysis(MistakeAnalysisRequest body) {
        return restTemplate.exchange(
                "/api/questions/" + UUID.randomUUID() + "/mistake-analysis", HttpMethod.POST,
                sharedStudentAuth(body), MistakeAnalysisResponse.class);
    }

    @Test
    void requiresAuthentication() {
        ResponseEntity<MistakeAnalysisResponse> response = restTemplate.postForEntity(
                "/api/questions/" + UUID.randomUUID() + "/mistake-analysis", sampleRequestBody(),
                MistakeAnalysisResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void returnsAnEmptyAnalysisWhenTheFlagIsOff() {
        // Deliberately not calling enableMistakeAnalysisFlag() — "unknown means off" by default.
        ResponseEntity<MistakeAnalysisResponse> response = postAnalysis(sampleRequestBody());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().mistakeType()).isNull();
        assertThat(response.getBody().explanation()).isNull();
        assertThat(response.getBody().suggestedAction()).isNull();
        assertThat(fixtureProvider.generateCount())
                .as("a disabled task must not reach the provider at all")
                .isZero();
    }

    @Test
    void generatesAGroundedAnalysisWhenEnabled() {
        enableMistakeAnalysisFlag();
        enableFixtureProvider();

        ResponseEntity<MistakeAnalysisResponse> response = postAnalysis(sampleRequestBody());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        MistakeAnalysisResponse body = response.getBody();

        // sampleRequestBody() has timesAnsweredWrong = 2, so the prompt says they have missed it
        // before and the fixture classifies accordingly — exercising the real qualitative line
        // rather than a canned type.
        assertThat(body.mistakeType())
                .as("the taxonomy value must survive validation and the round trip")
                .isEqualTo("REPEATED_MISTAKE");
        assertThat(body.suggestedAction()).contains("Speed, Time and Distance");
    }

    /**
     * The bug a real Groq call found: {@code timesAnsweredWrong} counts the attempt being analysed,
     * so a bare "1" under a "wrong before" label read as "once before" and a first-time miss came
     * back as {@code REPEATED_MISTAKE} — telling a student they had "repeatedly confused" something
     * they had got wrong once. The prompt now says it in words, and this guards both directions.
     */
    @Test
    void doesNotCallAFirstTimeMissARepeatedMistake() {
        enableMistakeAnalysisFlag();
        enableFixtureProvider();

        MistakeAnalysisRequest firstMiss = new MistakeAnalysisRequest(
                "A train travels 120 km in 2 hours. What is its average speed?",
                List.of("40 km/h", "50 km/h", "60 km/h", "70 km/h"),
                "60 km/h",
                "50 km/h",
                "Quantitative Aptitude",
                "Speed, Time and Distance",
                "NEEDS_ATTENTION",
                1,
                "en");

        assertThat(postAnalysis(firstMiss).getBody().mistakeType())
                .as("timesAnsweredWrong = 1 means this attempt, not one before it")
                .isEqualTo("MISREADING");

        MistakeAnalysisRequest repeat = new MistakeAnalysisRequest(
                "A train travels 120 km in 2 hours. What is its average speed?",
                List.of("40 km/h", "50 km/h", "60 km/h", "70 km/h"),
                "60 km/h",
                "50 km/h",
                "Quantitative Aptitude",
                "Speed, Time and Distance",
                "NEEDS_ATTENTION",
                2,
                "en");

        assertThat(postAnalysis(repeat).getBody().mistakeType()).isEqualTo("REPEATED_MISTAKE");
    }

    /**
     * An analysis must be able to quote the two answers — "you chose 50 km/h rather than 60 km/h"
     * is the single most useful sentence this task produces, and a real Groq call was rejected for
     * exactly that under the original number-grounding rule.
     */
    @Test
    void mayCiteTheAnswersItWasGiven() {
        enableMistakeAnalysisFlag();
        enableFixtureProvider();

        MistakeAnalysisRequest request = new MistakeAnalysisRequest(
                "A train travels 120 km in 2 hours. What is its average speed?",
                List.of("40 km/h", "50 km/h", "60 km/h", "70 km/h"),
                "60 km/h",
                "50 km/h",
                "Quantitative Aptitude",
                "Speed, Time and Distance",
                null,
                null,
                "en");

        // Goes through the real service, the real grounding and the real validator: the fixture
        // quotes the verified answer back ("The answer is 60 km/h."), which is exactly the shape
        // the first real Groq call was rejected for. A pass here means 60 is genuinely allowed.
        MistakeAnalysisResponse body = postAnalysis(request).getBody();

        assertThat(body.mistakeType())
                .as("an analysis quoting the answer it was given must not be rejected as ungrounded")
                .isEqualTo("MISREADING");
        assertThat(body.explanation()).contains("60 km/h");
    }

    /**
     * An unattempted question is a normal input here (Mock Test leaves questions blank), so the
     * prompt has to describe that rather than sending a null through as if it were an answer.
     */
    @Test
    void handlesAnUnansweredQuestion() {
        enableMistakeAnalysisFlag();
        enableFixtureProvider();

        MistakeAnalysisRequest unanswered = new MistakeAnalysisRequest(
                "A train travels 120 km in 2 hours. What is its average speed?",
                List.of("40 km/h", "50 km/h", "60 km/h", "70 km/h"),
                "60 km/h",
                null,
                "Quantitative Aptitude",
                "Speed, Time and Distance",
                "NEEDS_ATTENTION",
                1,
                "en");

        MistakeAnalysisResponse body = postAnalysis(unanswered).getBody();

        assertThat(body.mistakeType()).isEqualTo("MISREADING");
        assertThat(body.explanation()).isNotBlank();
        assertThat(body.suggestedAction()).isNotBlank();
    }
}
