package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.CreateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.QuestionResponse;
import com.sarkaritaiyaari.backend.dto.QuestionTypeResponse;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TASK-2301 Phase P2 Wave B — verified against the real dev database, the same discipline
 * P0/P1/Wave A used: real HTTP round trips, not just a clean compile.
 */
class WaveBFreeInputTypesTest extends AbstractIntegrationTest {

    @Test
    void questionTypesEndpoint_nowListsAllNineTypesAsAuthorable() {
        ResponseEntity<QuestionTypeResponse[]> response =
                restTemplate.getForEntity("/api/question-types", QuestionTypeResponse[].class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);

        List<String> enabled = List.of(response.getBody()).stream()
                .filter(QuestionTypeResponse::authoringEnabled)
                .map(QuestionTypeResponse::code)
                .toList();
        assertThat(enabled).containsExactlyInAnyOrder(
                "SINGLE_CHOICE", "MULTIPLE_CHOICE", "TRUE_FALSE", "ASSERTION_REASON", "STATEMENT_COMBINATION",
                "NUMERIC", "FILL_BLANK", "MATCH", "ORDERING");
    }

    @Test
    void numeric_createsWithAToleranceAndAWholeNumberDisplayAnswer() {
        CreateQuestionRequest request = sampleRequest();
        request.setQuestionType("NUMERIC");
        request.setCorrectAnswer(null);
        request.setAnswerKey(Map.of("correctValue", 42, "tolerance", 1));
        request.getTranslations().get(0).setOptions(List.of());

        QuestionResponse created = createAndTrack(request);

        assertThat(created.getQuestionType()).isEqualTo("NUMERIC");
        assertThat(created.getAnswerKey()).isEqualTo(Map.of("correctValue", 42.0, "tolerance", 1.0));
        // A computed display string for the legacy column — whole numbers show without ".0".
        assertThat(created.getCorrectAnswer()).isEqualTo("42");
    }

    @Test
    void numeric_defaultsToleranceToZeroWhenOmitted() {
        CreateQuestionRequest request = sampleRequest();
        request.setQuestionType("NUMERIC");
        request.setCorrectAnswer(null);
        request.setAnswerKey(Map.of("correctValue", 3.5));
        request.getTranslations().get(0).setOptions(List.of());

        QuestionResponse created = createAndTrack(request);

        assertThat(created.getAnswerKey()).isEqualTo(Map.of("correctValue", 3.5, "tolerance", 0.0));
        assertThat(created.getCorrectAnswer()).isEqualTo("3.5");
    }

    @Test
    void numeric_rejectsAuthoredOptions() {
        CreateQuestionRequest request = sampleRequest();
        request.setQuestionType("NUMERIC");
        request.setCorrectAnswer(null);
        request.setAnswerKey(Map.of("correctValue", 10));
        // Left as the default 4 options — NUMERIC must reject this, not silently accept it.

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/questions", HttpMethod.POST, adminAuth(request), String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void numeric_rejectsANegativeTolerance() {
        CreateQuestionRequest request = sampleRequest();
        request.setQuestionType("NUMERIC");
        request.setCorrectAnswer(null);
        request.setAnswerKey(Map.of("correctValue", 10, "tolerance", -1));
        request.getTranslations().get(0).setOptions(List.of());

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/questions", HttpMethod.POST, adminAuth(request), String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void fillBlank_createsWithMultipleAcceptedAnswers() {
        CreateQuestionRequest request = sampleRequest();
        request.setQuestionType("FILL_BLANK");
        request.setCorrectAnswer(null);
        request.setAnswerKey(Map.of("acceptedAnswers", List.of("New Delhi", "Delhi")));
        request.getTranslations().get(0).setOptions(List.of());

        QuestionResponse created = createAndTrack(request);

        assertThat(created.getQuestionType()).isEqualTo("FILL_BLANK");
        assertThat(created.getAnswerKey()).isEqualTo(Map.of("acceptedAnswers", List.of("New Delhi", "Delhi")));
        assertThat(created.getCorrectAnswer()).isEqualTo("New Delhi / Delhi");
    }

    @Test
    void fillBlank_rejectsAnEmptyAcceptedAnswerList() {
        CreateQuestionRequest request = sampleRequest();
        request.setQuestionType("FILL_BLANK");
        request.setCorrectAnswer(null);
        request.setAnswerKey(Map.of("acceptedAnswers", List.of()));
        request.getTranslations().get(0).setOptions(List.of());

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/questions", HttpMethod.POST, adminAuth(request), String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void match_createsWithContentStructureAndAFullCorrectMapping() {
        CreateQuestionRequest request = sampleRequest();
        request.setQuestionType("MATCH");
        request.setCorrectAnswer(null);
        request.setContentStructure(Map.of(
                "leftKeys", List.of("L1", "L2"),
                "rightKeys", List.of("R1", "R2", "R3")));
        request.setAnswerKey(Map.of("correctMapping", Map.of("L1", "R2", "L2", "R1")));
        request.getTranslations().get(0).setOptions(List.of());
        request.getTranslations().get(0).setContent(Map.of(
                "leftLabels", Map.of("L1", "River Ganga", "L2", "River Yamuna"),
                "rightLabels", Map.of("R1", "Allahabad", "R2", "Haridwar", "R3", "Nashik")));

        QuestionResponse created = createAndTrack(request);

        assertThat(created.getQuestionType()).isEqualTo("MATCH");
        assertThat(created.getContentStructure()).isEqualTo(Map.of(
                "leftKeys", List.of("L1", "L2"), "rightKeys", List.of("R1", "R2", "R3")));
        assertThat(created.getAnswerKey()).isEqualTo(Map.of("correctMapping", Map.of("L1", "R2", "L2", "R1")));
        assertThat(created.getCorrectAnswer()).isEqualTo("L1-R2,L2-R1");
    }

    @Test
    void match_rejectsAMappingMissingALeftKey() {
        CreateQuestionRequest request = sampleRequest();
        request.setQuestionType("MATCH");
        request.setCorrectAnswer(null);
        request.setContentStructure(Map.of("leftKeys", List.of("L1", "L2"), "rightKeys", List.of("R1", "R2")));
        // Only maps L1 - L2 is missing.
        request.setAnswerKey(Map.of("correctMapping", Map.of("L1", "R2")));
        request.getTranslations().get(0).setOptions(List.of());
        request.getTranslations().get(0).setContent(Map.of(
                "leftLabels", Map.of("L1", "A", "L2", "B"),
                "rightLabels", Map.of("R1", "X", "R2", "Y")));

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/questions", HttpMethod.POST, adminAuth(request), String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void match_rejectsATranslationMissingARightLabel() {
        CreateQuestionRequest request = sampleRequest();
        request.setQuestionType("MATCH");
        request.setCorrectAnswer(null);
        request.setContentStructure(Map.of("leftKeys", List.of("L1", "L2"), "rightKeys", List.of("R1", "R2")));
        request.setAnswerKey(Map.of("correctMapping", Map.of("L1", "R1", "L2", "R2")));
        request.getTranslations().get(0).setOptions(List.of());
        // rightLabels is missing R2 entirely.
        request.getTranslations().get(0).setContent(Map.of(
                "leftLabels", Map.of("L1", "A", "L2", "B"),
                "rightLabels", Map.of("R1", "X")));

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/questions", HttpMethod.POST, adminAuth(request), String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void ordering_createsWithAPermutationOfItemKeys() {
        CreateQuestionRequest request = sampleRequest();
        request.setQuestionType("ORDERING");
        request.setCorrectAnswer(null);
        request.setContentStructure(Map.of("itemKeys", List.of("I1", "I2", "I3")));
        request.setAnswerKey(Map.of("correctOrder", List.of("I3", "I1", "I2")));
        request.getTranslations().get(0).setOptions(List.of());
        request.getTranslations().get(0).setContent(Map.of(
                "itemLabels", Map.of("I1", "Sow the seed", "I2", "Harvest the crop", "I3", "Plough the field")));

        QuestionResponse created = createAndTrack(request);

        assertThat(created.getQuestionType()).isEqualTo("ORDERING");
        assertThat(created.getContentStructure()).isEqualTo(Map.of("itemKeys", List.of("I1", "I2", "I3")));
        assertThat(created.getAnswerKey()).isEqualTo(Map.of("correctOrder", List.of("I3", "I1", "I2")));
        assertThat(created.getCorrectAnswer()).isEqualTo("I3,I1,I2");
    }

    @Test
    void ordering_rejectsACorrectOrderThatIsNotAPermutation() {
        CreateQuestionRequest request = sampleRequest();
        request.setQuestionType("ORDERING");
        request.setCorrectAnswer(null);
        request.setContentStructure(Map.of("itemKeys", List.of("I1", "I2", "I3")));
        // I2 repeated, I3 missing entirely.
        request.setAnswerKey(Map.of("correctOrder", List.of("I1", "I2", "I2")));
        request.getTranslations().get(0).setOptions(List.of());
        request.getTranslations().get(0).setContent(Map.of(
                "itemLabels", Map.of("I1", "A", "I2", "B", "I3", "C")));

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/questions", HttpMethod.POST, adminAuth(request), String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void ordering_rejectsFewerThanTwoItemKeys() {
        CreateQuestionRequest request = sampleRequest();
        request.setQuestionType("ORDERING");
        request.setCorrectAnswer(null);
        request.setContentStructure(Map.of("itemKeys", List.of("I1")));
        request.setAnswerKey(Map.of("correctOrder", List.of("I1")));
        request.getTranslations().get(0).setOptions(List.of());
        request.getTranslations().get(0).setContent(Map.of("itemLabels", Map.of("I1", "A")));

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/questions", HttpMethod.POST, adminAuth(request), String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    private QuestionResponse createAndTrack(CreateQuestionRequest request) {
        ResponseEntity<QuestionResponse> response = restTemplate.exchange(
                "/api/questions", HttpMethod.POST, adminAuth(request), QuestionResponse.class);
        assertThat(response.getStatusCode()).as(response.toString()).isEqualTo(HttpStatus.CREATED);
        QuestionResponse created = response.getBody();
        createdIds.add(created.getId());
        return created;
    }
}
