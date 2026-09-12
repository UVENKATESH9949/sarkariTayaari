package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.CreateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.QuestionResponse;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TASK-2601 Phase 3 — batch hydration for a client with no local question bank (the web
 * app), used to turn a bare questionId from session/attempt review or a bookmark into real
 * content. Public, same visibility as /live.
 */
class QuestionsByIdsTest extends AbstractIntegrationTest {

    @Test
    void byIds_returnsRequestedQuestionsOnly() {
        QuestionResponse a = createQuestion(sampleRequest());
        QuestionResponse b = createQuestion(sampleRequest());
        QuestionResponse notRequested = createQuestion(sampleRequest());

        ResponseEntity<QuestionResponse[]> response = restTemplate.getForEntity(
                "/api/questions/by-ids?ids=" + a.getId() + "," + b.getId(), QuestionResponse[].class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<UUID> ids = List.of(response.getBody()).stream().map(QuestionResponse::getId).toList();
        assertThat(ids).containsExactlyInAnyOrder(a.getId(), b.getId());
        assertThat(ids).doesNotContain(notRequested.getId());
    }

    @Test
    void byIds_excludesSoftDeletedQuestions() {
        QuestionResponse kept = createQuestion(sampleRequest());
        QuestionResponse deleted = createQuestion(sampleRequest());
        restTemplate.exchange("/api/questions/" + deleted.getId(), HttpMethod.DELETE, adminAuth(), Void.class);

        ResponseEntity<QuestionResponse[]> response = restTemplate.getForEntity(
                "/api/questions/by-ids?ids=" + kept.getId() + "," + deleted.getId(), QuestionResponse[].class);

        List<UUID> ids = List.of(response.getBody()).stream().map(QuestionResponse::getId).toList();
        assertThat(ids).containsExactly(kept.getId());
    }

    @Test
    void byIds_unknownId_isSilentlyOmittedNotAnError() {
        QuestionResponse kept = createQuestion(sampleRequest());

        ResponseEntity<QuestionResponse[]> response = restTemplate.getForEntity(
                "/api/questions/by-ids?ids=" + kept.getId() + "," + UUID.randomUUID(), QuestionResponse[].class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<UUID> ids = List.of(response.getBody()).stream().map(QuestionResponse::getId).toList();
        assertThat(ids).containsExactly(kept.getId());
    }

    @Test
    void byIds_missingParam_returns400() {
        ResponseEntity<Map> response = restTemplate.getForEntity("/api/questions/by-ids", Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    /* ------------------------------------------------------------------- helpers */

    private QuestionResponse createQuestion(CreateQuestionRequest request) {
        ResponseEntity<QuestionResponse> response =
                restTemplate.exchange("/api/questions", HttpMethod.POST, adminAuth(request), QuestionResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        QuestionResponse created = response.getBody();
        createdIds.add(created.getId());
        return created;
    }
}
