package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.ai.content.FixtureAiContentProvider;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.AiAdminConfigResponse;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.UpdateAiProviderConfigRequest;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.UpdateAiSettingsRequest;
import com.sarkaritaiyaari.backend.repository.AiContentRepository;
import com.sarkaritaiyaari.backend.repository.AiProviderConfigRepository;
import com.sarkaritaiyaari.backend.repository.AiSettingsRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TASK-2701 Phase 2 — the full path: generate against a real (test-fixture) provider, validate,
 * persist, and move a row through DRAFT -> REVIEW -> PUBLISHED (and back). Uses the same
 * "swap in a fake provider under its own bean name, enable it via the AI Admin Control Center's
 * own dynamic override" mechanism {@code AiConfigurationTest} already exercises for MOCK/CLAUDE
 * — see {@link FixtureAiContentProvider}'s own Javadoc for why {@code MockAIProvider} itself
 * cannot stand in here (it echoes plain text, which correctly fails JSON parsing).
 */
class AiContentIntegrationTest extends AbstractIntegrationTest {

    private static final String FIXTURE_PROVIDER = "aicontentfixture";

    @Autowired
    private AiContentRepository aiContentRepository;

    @Autowired
    private AiSettingsRepository settingsRepository;

    @Autowired
    private AiProviderConfigRepository providerConfigRepository;

    private final List<UUID> createdContentIds = new ArrayList<>();

    @BeforeEach
    @AfterEach
    void resetAiState() {
        settingsRepository.findById("default").ifPresent(settings -> {
            settings.setEnabled(null);
            settings.setActiveProvider(null);
            settingsRepository.save(settings);
        });
        // AiConfigurationService stores the provider id UPPERCASED (see updateProviderConfig's
        // own canonicalization) — the same convention AiConfigurationTest's cleanup already uses
        // for "MOCK"/"CLAUDE". Deleting the lowercase bean name here would be a silent no-op and
        // leak this row into every later test, which is exactly what happened before this fix:
        // a stale row's non-zero version made every subsequent enableFixtureProvider() call 409.
        providerConfigRepository.deleteById(FIXTURE_PROVIDER.toUpperCase(java.util.Locale.ROOT));
        if (!createdContentIds.isEmpty()) {
            aiContentRepository.deleteAllById(createdContentIds);
            createdContentIds.clear();
        }
    }

    /** Configures {@link FixtureAiContentProvider} as the active provider for one test. */
    private void enableFixtureProvider() {
        AiAdminConfigResponse config = restTemplate.exchange(
                "/api/admin/ai/config", HttpMethod.GET, adminAuth(), AiAdminConfigResponse.class).getBody();
        assertThat(config.availableProviders())
                .as("the test fixture provider bean must be picked up by AIProviderRegistry")
                .contains(FIXTURE_PROVIDER.toUpperCase(java.util.Locale.ROOT));

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

    private UUID createQuestion() {
        Map<String, Object> request = Map.of(
                "correctAnswer", "A",
                "topicId", testTopicId.toString(),
                "difficulty", "easy",
                "examCodes", List.of(TEST_EXAM_CODE),
                "translations", List.of(Map.of(
                        "languageCode", "en",
                        "questionText", "What is the capital of West Bengal?",
                        "options", List.of("Mumbai", "Kolkata", "Chennai", "Patna"),
                        "explanation", "Kolkata is the capital.")));

        @SuppressWarnings("unchecked")
        Map<String, Object> created = restTemplate
                .exchange("/api/questions", HttpMethod.POST, adminAuth(request), Map.class)
                .getBody();
        UUID id = UUID.fromString((String) created.get("id"));
        createdIds.add(id);
        return id;
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> generate(String taskId, String languageCode, List<UUID> subjectIds) {
        Map<String, Object> request = Map.of("taskId", taskId, "languageCode", languageCode,
                "subjectIds", subjectIds.stream().map(UUID::toString).toList());
        return restTemplate.exchange("/api/admin/ai-content/generate", HttpMethod.POST, adminAuth(request), Map.class)
                .getBody();
    }

    @Test
    void generate_producesAGroundedDraftFromTheConfiguredProvider() {
        enableFixtureProvider();
        UUID questionId = createQuestion();

        Map<String, Object> result = generate("QUESTION_EXPLANATION", "en", List.of(questionId));

        assertThat(result.get("generated")).isEqualTo(1);
        assertThat(result.get("failedValidation")).isEqualTo(0);
        assertThat(result.get("failedProvider")).isEqualTo(0);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) result.get("items");
        assertThat(items).hasSize(1);
        assertThat(items.get(0).get("outcome")).isEqualTo("GENERATED");
        UUID contentId = UUID.fromString((String) items.get(0).get("contentId"));
        createdContentIds.add(contentId);

        Map<String, Object> content = restTemplate
                .exchange("/api/admin/ai-content/" + contentId, HttpMethod.GET, adminAuth(), Map.class)
                .getBody();
        assertThat(content.get("contentStatus")).isEqualTo("DRAFT");
        assertThat(content.get("questionId")).isEqualTo(questionId.toString());
        @SuppressWarnings("unchecked")
        Map<String, Object> payload = (Map<String, Object>) content.get("payload");
        // The fixture provider echoes the verified answer back exactly as given — proving the
        // real prompt built by AiContentPrompts actually carries questions.correct_answer through
        // to the model and back. The stored value is the letter "A" (this is a single-choice
        // question created with correctAnswer="A"), not the resolved option text — grounding
        // tolerates either form but does not itself expand one to the other.
        assertThat(payload.get("answer")).isEqualTo("A");
    }

    @Test
    void generate_skipsAQuestionThatAlreadyHasContent() {
        enableFixtureProvider();
        UUID questionId = createQuestion();

        Map<String, Object> first = generate("QUESTION_EXPLANATION", "en", List.of(questionId));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> firstItems = (List<Map<String, Object>>) first.get("items");
        createdContentIds.add(UUID.fromString((String) firstItems.get(0).get("contentId")));

        Map<String, Object> second = generate("QUESTION_EXPLANATION", "en", List.of(questionId));

        assertThat(second.get("generated")).isEqualTo(0);
        assertThat(second.get("skippedExisting")).isEqualTo(1);
    }

    @Test
    void generate_rejectsAnUnsupportedLanguage() {
        enableFixtureProvider();
        UUID questionId = createQuestion();

        ResponseEntity<Map> response = restTemplate.exchange("/api/admin/ai-content/generate", HttpMethod.POST,
                adminAuth(Map.of("taskId", "QUESTION_EXPLANATION", "languageCode", "te",
                        "subjectIds", List.of(questionId.toString()))),
                Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void generate_rejectsAnUnknownTask() {
        ResponseEntity<Map> response = restTemplate.exchange("/api/admin/ai-content/generate", HttpMethod.POST,
                adminAuth(Map.of("taskId", "NOT_A_REAL_TASK", "languageCode", "en", "subjectIds", List.of())),
                Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void generate_rejectsAnUnauthenticatedCaller() {
        ResponseEntity<Map> response = restTemplate.postForEntity("/api/admin/ai-content/generate",
                Map.of("taskId", "QUESTION_EXPLANATION", "languageCode", "en", "subjectIds", List.of()), Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void generate_rejectsAStudentCaller() {
        ResponseEntity<Map> response = restTemplate.exchange("/api/admin/ai-content/generate", HttpMethod.POST,
                sharedStudentAuth(Map.of("taskId", "QUESTION_EXPLANATION", "languageCode", "en", "subjectIds", List.of())),
                Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    /** A reviewer may trigger review transitions but the spend-money action stays admin-only. */
    @Test
    void generate_rejectsAReviewerCaller() {
        ResponseEntity<Map> response = restTemplate.exchange("/api/admin/ai-content/generate", HttpMethod.POST,
                reviewerAuth(Map.of("taskId", "QUESTION_EXPLANATION", "languageCode", "en", "subjectIds", List.of())),
                Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void reviewLifecycle_draftThroughPublishedAndBack() {
        enableFixtureProvider();
        UUID questionId = createQuestion();
        Map<String, Object> generated = generate("QUESTION_EXPLANATION", "en", List.of(questionId));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) generated.get("items");
        UUID contentId = UUID.fromString((String) items.get(0).get("contentId"));
        createdContentIds.add(contentId);

        // DRAFT -> REVIEW
        Map<String, Object> submitted = restTemplate.exchange("/api/admin/ai-content/" + contentId + "/submit-for-review",
                HttpMethod.PUT, reviewerAuth(Map.of("expectedVersion", 0)), Map.class).getBody();
        assertThat(submitted.get("contentStatus")).isEqualTo("REVIEW");

        // REVIEW -> DRAFT, with a reason
        Map<String, Object> rejected = restTemplate.exchange("/api/admin/ai-content/" + contentId + "/reject",
                HttpMethod.PUT, reviewerAuth(Map.of("reason", "Explanation is too terse", "expectedVersion", 1)),
                Map.class).getBody();
        assertThat(rejected.get("contentStatus")).isEqualTo("DRAFT");
        assertThat(rejected.get("rejectionReason")).isEqualTo("Explanation is too terse");
        assertThat(rejected.get("reviewedByEmail")).isEqualTo(TEST_REVIEWER_EMAIL);

        // DRAFT -> PUBLISHED directly (the fast path, mirroring ExamGuide)
        Map<String, Object> published = restTemplate.exchange("/api/admin/ai-content/" + contentId + "/publish",
                HttpMethod.PUT, reviewerAuth(Map.of("expectedVersion", 2)), Map.class).getBody();
        assertThat(published.get("contentStatus")).isEqualTo("PUBLISHED");
        assertThat(published.get("rejectionReason")).isNull();

        // PUBLISHED -> DRAFT
        Map<String, Object> unpublished = restTemplate.exchange("/api/admin/ai-content/" + contentId + "/unpublish",
                HttpMethod.PUT, reviewerAuth(Map.of("expectedVersion", 3)), Map.class).getBody();
        assertThat(unpublished.get("contentStatus")).isEqualTo("DRAFT");
    }

    @Test
    void reject_requiresANonBlankReason() {
        enableFixtureProvider();
        UUID questionId = createQuestion();
        Map<String, Object> generated = generate("QUESTION_EXPLANATION", "en", List.of(questionId));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) generated.get("items");
        UUID contentId = UUID.fromString((String) items.get(0).get("contentId"));
        createdContentIds.add(contentId);

        restTemplate.exchange("/api/admin/ai-content/" + contentId + "/submit-for-review", HttpMethod.PUT,
                reviewerAuth(Map.of("expectedVersion", 0)), Map.class);

        ResponseEntity<Map> response = restTemplate.exchange("/api/admin/ai-content/" + contentId + "/reject",
                HttpMethod.PUT, reviewerAuth(Map.of("reason", "   ", "expectedVersion", 1)), Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void reject_onlyAppliesFromReview() {
        enableFixtureProvider();
        UUID questionId = createQuestion();
        Map<String, Object> generated = generate("QUESTION_EXPLANATION", "en", List.of(questionId));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) generated.get("items");
        UUID contentId = UUID.fromString((String) items.get(0).get("contentId"));
        createdContentIds.add(contentId);

        // Still DRAFT — never submitted for review.
        ResponseEntity<Map> response = restTemplate.exchange("/api/admin/ai-content/" + contentId + "/reject",
                HttpMethod.PUT, reviewerAuth(Map.of("reason", "not applicable", "expectedVersion", 0)), Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void transition_rejectsAStaleVersion() {
        enableFixtureProvider();
        UUID questionId = createQuestion();
        Map<String, Object> generated = generate("QUESTION_EXPLANATION", "en", List.of(questionId));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) generated.get("items");
        UUID contentId = UUID.fromString((String) items.get(0).get("contentId"));
        createdContentIds.add(contentId);

        ResponseEntity<Map> response = restTemplate.exchange("/api/admin/ai-content/" + contentId + "/submit-for-review",
                HttpMethod.PUT, reviewerAuth(Map.of("expectedVersion", 99)), Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @Test
    void list_filtersByStatusAndTask() {
        enableFixtureProvider();
        UUID questionId = createQuestion();
        Map<String, Object> generated = generate("QUESTION_EXPLANATION", "en", List.of(questionId));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) generated.get("items");
        UUID contentId = UUID.fromString((String) items.get(0).get("contentId"));
        createdContentIds.add(contentId);

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> draftQueue = restTemplate.exchange(
                "/api/admin/ai-content?taskId=QUESTION_EXPLANATION&status=DRAFT", HttpMethod.GET, reviewerAuth(),
                List.class).getBody();
        assertThat(draftQueue).extracting(m -> m.get("id")).contains(contentId.toString());

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> reviewQueue = restTemplate.exchange(
                "/api/admin/ai-content?status=REVIEW", HttpMethod.GET, reviewerAuth(), List.class).getBody();
        assertThat(reviewQueue).extracting(m -> m.get("id")).doesNotContain(contentId.toString());
    }

    /**
     * TASK-2701 Phase 3 — the public sync feed. No auth header at all, matching every other
     * content-sync endpoint this backend already exposes (questions/exam-structure).
     */
    @Test
    void sync_omitsPayloadUnlessPublished_andNeverNeedsAuth() {
        enableFixtureProvider();
        UUID questionId = createQuestion();
        Map<String, Object> generated = generate("QUESTION_EXPLANATION", "en", List.of(questionId));
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) generated.get("items");
        UUID contentId = UUID.fromString((String) items.get(0).get("contentId"));
        createdContentIds.add(contentId);

        // Still DRAFT: reachable via sync (so a full-sync watermark update stays correct) but
        // with no payload and published=false — never leaks unreviewed content.
        ResponseEntity<List> draftSync = restTemplate.exchange(
                "/api/ai-content/sync?since=0", HttpMethod.GET, null, List.class);
        assertThat(draftSync.getStatusCode()).isEqualTo(HttpStatus.OK);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> draftEntries = draftSync.getBody();
        Map<String, Object> draftEntry = draftEntries.stream()
                .filter(e -> contentId.toString().equals(e.get("id")))
                .findFirst().orElseThrow();
        assertThat(draftEntry.get("published")).isEqualTo(false);
        assertThat(draftEntry.get("payload")).isNull();

        restTemplate.exchange("/api/admin/ai-content/" + contentId + "/publish", HttpMethod.PUT,
                reviewerAuth(Map.of("expectedVersion", 0)), Map.class);

        ResponseEntity<List> publishedSync = restTemplate.exchange(
                "/api/ai-content/sync?since=0", HttpMethod.GET, null, List.class);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> publishedEntries = publishedSync.getBody();
        Map<String, Object> publishedEntry = publishedEntries.stream()
                .filter(e -> contentId.toString().equals(e.get("id")))
                .findFirst().orElseThrow();
        assertThat(publishedEntry.get("published")).isEqualTo(true);
        assertThat(publishedEntry.get("payload")).isNotNull();

        restTemplate.exchange("/api/admin/ai-content/" + contentId + "/unpublish", HttpMethod.PUT,
                reviewerAuth(Map.of("expectedVersion", 1)), Map.class);

        ResponseEntity<List> unpublishedSync = restTemplate.exchange(
                "/api/ai-content/sync?since=0", HttpMethod.GET, null, List.class);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> unpublishedEntries = unpublishedSync.getBody();
        Map<String, Object> unpublishedEntry = unpublishedEntries.stream()
                .filter(e -> contentId.toString().equals(e.get("id")))
                .findFirst().orElseThrow();
        assertThat(unpublishedEntry.get("published")).isEqualTo(false);
        assertThat(unpublishedEntry.get("payload")).isNull();
    }
}
