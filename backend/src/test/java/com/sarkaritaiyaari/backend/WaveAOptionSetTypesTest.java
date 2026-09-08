package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.AuthResponse;
import com.sarkaritaiyaari.backend.dto.CreateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.ProgressDtos;
import com.sarkaritaiyaari.backend.dto.QuestionResponse;
import com.sarkaritaiyaari.backend.dto.QuestionTypeResponse;
import com.sarkaritaiyaari.backend.dto.RegisterRequest;
import com.sarkaritaiyaari.backend.dto.TranslationRequest;
import com.sarkaritaiyaari.backend.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TASK-2301 Phase P2 Wave A — verified against the real dev database, the same discipline
 * P0/P1 used: real HTTP round trips, not just a clean compile.
 */
class WaveAOptionSetTypesTest extends AbstractIntegrationTest {

    private final List<String> createdEmails = new ArrayList<>();

    @AfterEach
    void cleanupUsers() {
        createdEmails.forEach(email -> userRepository.findByEmail(email).ifPresent(userRepository::delete));
        createdEmails.clear();
    }

    @Autowired
    private UserRepository userRepository;

    @Test
    void questionTypesEndpoint_listsAllFiveWaveATypesAsAuthorable() {
        ResponseEntity<QuestionTypeResponse[]> response =
                restTemplate.getForEntity("/api/question-types", QuestionTypeResponse[].class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);

        // containsAll, not containsExactlyInAnyOrder — this test's own scope is Wave A's five
        // types, not "no other type is authoring-enabled". Wave B (NUMERIC/FILL_BLANK/MATCH/
        // ORDERING) shipped after this test was written and correctly widened the real set;
        // that invariant now belongs to WaveBFreeInputTypesTest, not here, matching the same
        // lesson this file's own history already applied once (see QuestionTypeFoundationTest).
        List<String> enabled = List.of(response.getBody()).stream()
                .filter(QuestionTypeResponse::authoringEnabled)
                .map(QuestionTypeResponse::code)
                .toList();
        assertThat(enabled).contains(
                "SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "ASSERTION_REASON", "STATEMENT_COMBINATION");
    }

    @Test
    void multipleChoice_createsWithASetAnswerKeyAndADisplayCorrectAnswer() {
        CreateQuestionRequest request = sampleRequest();
        request.setQuestionType("MULTIPLE_CHOICE");
        request.setCorrectAnswer(null);
        request.setAnswerKey(Map.of("correctOptions", List.of(0, 2)));

        QuestionResponse created = createAndTrack(request);

        assertThat(created.getQuestionType()).isEqualTo("MULTIPLE_CHOICE");
        assertThat(created.getAnswerKey()).isEqualTo(Map.of("correctOptions", List.of(0, 2)));
        // A computed display string for the legacy column/admin list — not itself authoritative.
        assertThat(created.getCorrectAnswer()).isEqualTo("A,C");
    }

    @Test
    void multipleChoice_rejectsAnEmptyCorrectOptionsSet() {
        CreateQuestionRequest request = sampleRequest();
        request.setQuestionType("MULTIPLE_CHOICE");
        request.setCorrectAnswer(null);
        request.setAnswerKey(Map.of("correctOptions", List.of()));

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/questions", HttpMethod.POST, adminAuth(request), String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void trueFalse_createsWithABooleanAnswerKeyAndNoOptions() {
        CreateQuestionRequest request = sampleRequest();
        request.setQuestionType("TRUE_FALSE");
        request.setCorrectAnswer(null);
        request.setAnswerKey(Map.of("correctBoolean", false));
        request.getTranslations().get(0).setOptions(List.of());

        QuestionResponse created = createAndTrack(request);

        assertThat(created.getQuestionType()).isEqualTo("TRUE_FALSE");
        assertThat(created.getAnswerKey()).isEqualTo(Map.of("correctBoolean", false));
        assertThat(created.getCorrectAnswer()).isEqualTo("FALSE");
        assertThat(created.getTranslations().get(0).getOptions()).isEmpty();
    }

    @Test
    void trueFalse_rejectsAuthoredOptions() {
        CreateQuestionRequest request = sampleRequest();
        request.setQuestionType("TRUE_FALSE");
        request.setCorrectAnswer(null);
        request.setAnswerKey(Map.of("correctBoolean", true));
        // Left as the default 4 options — TRUE_FALSE must reject this, not silently accept it.

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/questions", HttpMethod.POST, adminAuth(request), String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void assertionReason_requiresContentAndReusesSingleChoiceScoring() {
        CreateQuestionRequest request = sampleRequest();
        request.setQuestionType("ASSERTION_REASON");
        request.setCorrectAnswer("B");
        request.getTranslations().get(0).setContent(Map.of(
                "assertion", "The Indian Constitution is the longest written constitution in the world.",
                "reason", "It contains detailed provisions covering many aspects of governance."));

        QuestionResponse created = createAndTrack(request);

        assertThat(created.getQuestionType()).isEqualTo("ASSERTION_REASON");
        // Same derivation as SINGLE_CHOICE — no new evaluator, just new authored content.
        assertThat(created.getAnswerKey()).isEqualTo(Map.of("correctOption", 1));
        assertThat(created.getTranslations().get(0).getContent()).containsKey("assertion");
    }

    @Test
    void assertionReason_rejectsAMissingReason() {
        CreateQuestionRequest request = sampleRequest();
        request.setQuestionType("ASSERTION_REASON");
        request.setCorrectAnswer("A");
        request.getTranslations().get(0).setContent(Map.of("assertion", "Something is true."));

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/questions", HttpMethod.POST, adminAuth(request), String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void statementCombination_requiresAtLeastTwoStatements() {
        CreateQuestionRequest request = sampleRequest();
        request.setQuestionType("STATEMENT_COMBINATION");
        request.setCorrectAnswer("A");
        request.getTranslations().get(0).setContent(Map.of("statements", List.of("Only one statement")));

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/questions", HttpMethod.POST, adminAuth(request), String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void statementCombination_createsWithARealStatementList() {
        CreateQuestionRequest request = sampleRequest();
        request.setQuestionType("STATEMENT_COMBINATION");
        request.setCorrectAnswer("C");
        request.getTranslations().get(0).setContent(Map.of(
                "statements", List.of("The President is the constitutional head of India.",
                        "The Prime Minister is directly elected by citizens.")));

        QuestionResponse created = createAndTrack(request);

        assertThat(created.getQuestionType()).isEqualTo("STATEMENT_COMBINATION");
        assertThat(created.getAnswerKey()).isEqualTo(Map.of("correctOption", 2));
        assertThat((List<?>) created.getTranslations().get(0).getContent().get("statements")).hasSize(2);
    }

    /**
     * The part of the "fully playable end-to-end" scope that a curl-shaped test can actually
     * prove: a MULTIPLE_CHOICE practice answer round-trips through the real response-model
     * columns (V26) — selected_index/correct_index null, response/outcome/score_fraction
     * populated and correct on restore. This is the same upload/restore endpoint the mobile
     * client's sync/progressSync.ts calls after finishing a real quiz.
     */
    @Test
    void multipleChoiceAnswer_roundTripsThroughTheResponseModel() {
        String token = signUp("wave-a-progress@example.com");

        ProgressDtos.PracticeSession session = new ProgressDtos.PracticeSession();
        session.setId("wave-a-session-1");
        session.setCompletedAt(OffsetDateTime.now());
        session.setExamLabel("SSC CGL");
        session.setSubjectName("General Awareness");
        session.setTopicName("Polity");
        session.setLevelLabel("Medium");
        session.setCorrectCount(1);
        session.setTotalCount(1);

        ProgressDtos.PracticeResult result = new ProgressDtos.PracticeResult();
        result.setOrderIndex(0);
        result.setQuestionId(UUID.randomUUID());
        // No selectedIndex/correctIndex — a MULTIPLE_CHOICE answer has neither.
        result.setCorrect(true);
        result.setQuestionType("MULTIPLE_CHOICE");
        result.setResponse(Map.of("selectedOptions", List.of(0, 2)));
        result.setOutcome("CORRECT");
        result.setScoreFraction(new java.math.BigDecimal("1.000"));
        session.setResults(List.of(result));

        ProgressDtos.SyncRequest request = new ProgressDtos.SyncRequest();
        request.setPracticeSessions(List.of(session));

        ResponseEntity<ProgressDtos.SyncResponse> uploaded = restTemplate.exchange(
                "/api/progress/sync", HttpMethod.POST, authed(token, request), ProgressDtos.SyncResponse.class);
        assertThat(uploaded.getStatusCode()).isEqualTo(HttpStatus.OK);

        ResponseEntity<ProgressDtos.RestoreResponse> restored = restTemplate.exchange(
                "/api/progress", HttpMethod.GET, authed(token, null), ProgressDtos.RestoreResponse.class);
        assertThat(restored.getStatusCode()).isEqualTo(HttpStatus.OK);

        ProgressDtos.PracticeResult restoredResult = restored.getBody().practiceSessions().get(0).getResults().get(0);
        assertThat(restoredResult.getSelectedIndex()).isNull();
        assertThat(restoredResult.getCorrectIndex()).isNull();
        assertThat(restoredResult.getQuestionType()).isEqualTo("MULTIPLE_CHOICE");
        assertThat(restoredResult.getResponse()).isEqualTo(Map.of("selectedOptions", List.of(0, 2)));
        assertThat(restoredResult.getOutcome()).isEqualTo("CORRECT");
        assertThat(restoredResult.getScoreFraction()).isEqualByComparingTo("1.000");
    }

    private QuestionResponse createAndTrack(CreateQuestionRequest request) {
        ResponseEntity<QuestionResponse> response = restTemplate.exchange(
                "/api/questions", HttpMethod.POST, adminAuth(request), QuestionResponse.class);
        assertThat(response.getStatusCode()).as(response.toString()).isEqualTo(HttpStatus.CREATED);
        QuestionResponse created = response.getBody();
        createdIds.add(created.getId());
        return created;
    }

    private String signUp(String email) {
        RegisterRequest request = new RegisterRequest();
        request.setEmail(email);
        request.setPassword("practice123");
        ResponseEntity<AuthResponse> response =
                restTemplate.postForEntity("/api/auth/register", request, AuthResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdEmails.add(email);
        return response.getBody().token();
    }

    private static <T> HttpEntity<T> authed(String token, T body) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        headers.setContentType(MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, headers);
    }
}
