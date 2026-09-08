package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.CreateQuestionOccurrenceRequest;
import com.sarkaritaiyaari.backend.dto.CreateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.QuestionOccurrenceResponse;
import com.sarkaritaiyaari.backend.dto.QuestionResponse;
import com.sarkaritaiyaari.backend.dto.TopicIntelligenceDtos;
import com.sarkaritaiyaari.backend.dto.UpdateQuestionRequest;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** TASK-2501 Phase 1 -- question_occurrences: the new admin-added-occurrence surface, the
 * automatic legacy-PYQ-column sync, and the merge-on-duplicate-resolution behavior. */
class QuestionOccurrenceTest extends AbstractIntegrationTest {

    @Test
    void addListDelete_occurrence() {
        QuestionResponse question = createQuestion(sampleRequest());

        CreateQuestionOccurrenceRequest add = new CreateQuestionOccurrenceRequest();
        add.setExamCode(TEST_EXAM_CODE);
        add.setPyqYear(2022);
        add.setPyqShift("Shift 1");

        ResponseEntity<QuestionOccurrenceResponse> addResponse = restTemplate.exchange(
                "/api/questions/" + question.getId() + "/occurrences", HttpMethod.POST,
                adminAuth(add), QuestionOccurrenceResponse.class);
        assertThat(addResponse.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(addResponse.getBody().getExamCode()).isEqualTo(TEST_EXAM_CODE);
        assertThat(addResponse.getBody().isLegacyDerived()).isFalse();
        UUID occurrenceId = addResponse.getBody().getId();

        ResponseEntity<QuestionOccurrenceResponse[]> listResponse = restTemplate.exchange(
                "/api/questions/" + question.getId() + "/occurrences", HttpMethod.GET,
                adminAuth(), QuestionOccurrenceResponse[].class);
        assertThat(listResponse.getBody()).hasSize(1);

        restTemplate.exchange(
                "/api/questions/" + question.getId() + "/occurrences/" + occurrenceId,
                HttpMethod.DELETE, adminAuth(), Void.class);

        ResponseEntity<QuestionOccurrenceResponse[]> afterDelete = restTemplate.exchange(
                "/api/questions/" + question.getId() + "/occurrences", HttpMethod.GET,
                adminAuth(), QuestionOccurrenceResponse[].class);
        assertThat(afterDelete.getBody()).isEmpty();
    }

    @Test
    void create_withPyqFields_producesExactlyOneLegacyDerivedOccurrence() {
        CreateQuestionRequest request = sampleRequest();
        request.setPyq(true);
        request.setPyqYear(2021);
        request.setPyqShift("Shift 2");

        QuestionResponse question = createQuestion(request);

        assertThat(question.getOccurrences()).hasSize(1);
        assertThat(question.getOccurrences().get(0).isLegacyDerived()).isTrue();
        assertThat(question.getOccurrences().get(0).getPyqYear()).isEqualTo(2021);
        assertThat(question.getOccurrences().get(0).getExamCode()).isEqualTo(TEST_EXAM_CODE);
    }

    @Test
    void update_withNewPyqFields_replacesLegacyOccurrenceRatherThanDuplicatingIt() {
        CreateQuestionRequest request = sampleRequest();
        request.setPyq(true);
        request.setPyqYear(2021);
        request.setPyqShift("Shift 2");
        QuestionResponse question = createQuestion(request);

        UpdateQuestionRequest update = new UpdateQuestionRequest();
        update.setCorrectAnswer("A");
        update.setTopicId(question.getTopicId());
        update.setDifficulty("easy");
        update.setExamCodes(List.of(TEST_EXAM_CODE));
        update.setPyq(true);
        update.setPyqYear(2023);
        update.setPyqShift("Shift 3");

        ResponseEntity<QuestionResponse> response = restTemplate.exchange(
                "/api/questions/" + question.getId(), HttpMethod.PUT, adminAuth(update), QuestionResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().getOccurrences()).hasSize(1);
        assertThat(response.getBody().getOccurrences().get(0).getPyqYear()).isEqualTo(2023);
        assertThat(response.getBody().getOccurrences().get(0).getPyqShift()).isEqualTo("Shift 3");
    }

    @Test
    void update_pyqFalse_leavesNoLegacyOccurrence() {
        CreateQuestionRequest request = sampleRequest();
        request.setPyq(true);
        request.setPyqYear(2021);
        QuestionResponse question = createQuestion(request);
        assertThat(question.getOccurrences()).hasSize(1);

        UpdateQuestionRequest update = new UpdateQuestionRequest();
        update.setCorrectAnswer("A");
        update.setTopicId(question.getTopicId());
        update.setDifficulty("easy");
        update.setExamCodes(List.of(TEST_EXAM_CODE));
        update.setPyq(false);

        ResponseEntity<QuestionResponse> response = restTemplate.exchange(
                "/api/questions/" + question.getId(), HttpMethod.PUT, adminAuth(update), QuestionResponse.class);

        assertThat(response.getBody().getOccurrences()).isEmpty();
    }

    @Test
    void resolvingDuplicate_mergesOccurrencesAndSoftDeletesTheLoser() {
        // sampleRequest()'s english text is fixed ("Sample question text?"), so a second
        // question built from it fingerprints identically to the first -- the same collision
        // every other test in this suite that calls sampleRequest() twice already relies on
        // never being rejected, just recorded.
        CreateQuestionRequest originalRequest = sampleRequest();
        originalRequest.setPyq(true);
        originalRequest.setPyqYear(2019);
        QuestionResponse original = createQuestion(originalRequest);

        CreateQuestionRequest duplicateRequest = sampleRequest();
        duplicateRequest.setPyq(true);
        duplicateRequest.setPyqYear(2022);
        QuestionResponse duplicate = createQuestion(duplicateRequest);

        assertThat(duplicate.getDuplicateOfQuestionIds()).containsExactly(original.getId());

        TopicIntelligenceDtos.DuplicateResolutionRequest resolution = new TopicIntelligenceDtos.DuplicateResolutionRequest();
        resolution.setResolution("DUPLICATE");
        ResponseEntity<Void> resolveResponse = restTemplate.exchange(
                "/api/question-duplicates/" + duplicate.getId() + "/" + original.getId(),
                HttpMethod.PUT, adminAuth(resolution), Void.class);
        assertThat(resolveResponse.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        ResponseEntity<QuestionResponse> survivor = restTemplate.exchange(
                "/api/questions/" + original.getId(), HttpMethod.GET, adminAuth(), QuestionResponse.class);
        assertThat(survivor.getBody().getOccurrences()).hasSize(2);
        assertThat(survivor.getBody().getOccurrences())
                .extracting(QuestionOccurrenceResponse::getPyqYear)
                .containsExactlyInAnyOrder(2019, 2022);

        ResponseEntity<QuestionResponse> loser = restTemplate.exchange(
                "/api/questions/" + duplicate.getId(), HttpMethod.GET, adminAuth(), QuestionResponse.class);
        assertThat(loser.getBody().isDeleted()).isTrue();

        // Idempotent -- re-resolving the same pair must not fail or double-merge.
        ResponseEntity<Void> secondResolve = restTemplate.exchange(
                "/api/question-duplicates/" + duplicate.getId() + "/" + original.getId(),
                HttpMethod.PUT, adminAuth(resolution), Void.class);
        assertThat(secondResolve.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        ResponseEntity<QuestionResponse> survivorAfterSecondResolve = restTemplate.exchange(
                "/api/questions/" + original.getId(), HttpMethod.GET, adminAuth(), QuestionResponse.class);
        assertThat(survivorAfterSecondResolve.getBody().getOccurrences()).hasSize(2);
    }

    private QuestionResponse createQuestion(CreateQuestionRequest request) {
        ResponseEntity<QuestionResponse> response =
                restTemplate.exchange("/api/questions", HttpMethod.POST, adminAuth(request), QuestionResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        QuestionResponse created = response.getBody();
        createdIds.add(created.getId());
        return created;
    }
}
