package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.ExamRequest;
import com.sarkaritaiyaari.backend.dto.ExamResponse;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.Arrays;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ExamCrudTest extends AbstractIntegrationTest {

    @Test
    void createThenGet_returnsSameData() {
        ExamResponse created = createExam("CRUD_TEST_EXAM", "CRUD Test Exam", true, 50);

        ResponseEntity<ExamResponse> response = restTemplate.exchange(
                "/api/exams/" + created.getCode(), HttpMethod.GET, adminAuth(), ExamResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().getName()).isEqualTo("CRUD Test Exam");
        assertThat(response.getBody().isActive()).isTrue();
    }

    @Test
    void listActive_onlyIncludesActiveExams() {
        createExam("CRUD_ACTIVE_EXAM", "Active", true, 51);
        createExam("CRUD_INACTIVE_EXAM", "Inactive", false, 52);

        ResponseEntity<ExamResponse[]> response = restTemplate.getForEntity("/api/exams", ExamResponse[].class);
        List<String> codes = Arrays.stream(response.getBody()).map(ExamResponse::getCode).toList();

        assertThat(codes).contains("CRUD_ACTIVE_EXAM");
        assertThat(codes).doesNotContain("CRUD_INACTIVE_EXAM");
    }

    @Test
    void listAll_includesInactiveExams() {
        createExam("CRUD_ALL_INACTIVE_EXAM", "Inactive", false, 53);

        ResponseEntity<ExamResponse[]> response = restTemplate.exchange(
                "/api/exams/all", HttpMethod.GET, adminAuth(), ExamResponse[].class);
        List<String> codes = Arrays.stream(response.getBody()).map(ExamResponse::getCode).toList();

        assertThat(codes).contains("CRUD_ALL_INACTIVE_EXAM");
    }

    @Test
    void update_changesFields() {
        ExamResponse created = createExam("CRUD_UPDATE_EXAM", "Original", false, 54);

        ExamRequest update = new ExamRequest();
        update.setCode(created.getCode());
        update.setName("Updated Name");
        update.setActive(true);
        update.setDisplayOrder(55);

        ResponseEntity<ExamResponse> response = restTemplate.exchange(
                "/api/exams/" + created.getCode(), HttpMethod.PUT, adminAuth(update), ExamResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().getName()).isEqualTo("Updated Name");
        assertThat(response.getBody().isActive()).isTrue();
    }

    @Test
    void delete_removesExam() {
        ExamRequest request = new ExamRequest();
        request.setCode("CRUD_DELETE_EXAM");
        request.setName("To Delete");
        request.setActive(false);
        request.setDisplayOrder(56);
        restTemplate.exchange("/api/exams", HttpMethod.POST, adminAuth(request), ExamResponse.class);

        restTemplate.exchange("/api/exams/CRUD_DELETE_EXAM", HttpMethod.DELETE, adminAuth(), Void.class);

        ResponseEntity<ExamResponse> response = restTemplate.exchange(
                "/api/exams/CRUD_DELETE_EXAM", HttpMethod.GET, adminAuth(), ExamResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void duplicateCode_returns400() {
        createExam("CRUD_DUP_EXAM", "First", false, 57);

        ExamRequest duplicate = new ExamRequest();
        duplicate.setCode("CRUD_DUP_EXAM");
        duplicate.setName("Second");
        duplicate.setActive(false);
        duplicate.setDisplayOrder(58);

        ResponseEntity<Map> response = restTemplate.exchange("/api/exams", HttpMethod.POST, adminAuth(duplicate), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void difficultyAndBadge_defaultToNullAndRoundTrip() {
        ExamResponse created = createExam("CRUD_TAGGED_EXAM", "Untagged", false, 59);
        // Absent rather than defaulted: the clients render "no difficulty" as no stat pill,
        // so a default here would silently claim an exam had been assessed.
        assertThat(created.getDifficulty()).isNull();
        assertThat(created.getBadge()).isNull();

        ExamRequest update = new ExamRequest();
        update.setCode(created.getCode());
        update.setName("Tagged");
        update.setActive(true);
        update.setDisplayOrder(59);
        update.setDifficulty("medium");
        update.setBadge("trending");

        ResponseEntity<ExamResponse> response = restTemplate.exchange(
                "/api/exams/" + created.getCode(), HttpMethod.PUT, adminAuth(update), ExamResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().getDifficulty()).isEqualTo("medium");
        assertThat(response.getBody().getBadge()).isEqualTo("trending");
    }

    @Test
    void blankDifficultyOrBadge_clearsRatherThanFailing() {
        ExamResponse created = createExam("CRUD_CLEARED_EXAM", "Cleared", false, 60);

        ExamRequest update = new ExamRequest();
        update.setCode(created.getCode());
        update.setName("Cleared");
        update.setActive(false);
        update.setDisplayOrder(60);
        // The admin form submits "" for "not set" — that has to clear the FK, not trip it.
        update.setDifficulty("");
        update.setBadge("");

        ResponseEntity<ExamResponse> response = restTemplate.exchange(
                "/api/exams/" + created.getCode(), HttpMethod.PUT, adminAuth(update), ExamResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().getDifficulty()).isNull();
        assertThat(response.getBody().getBadge()).isNull();
    }

    @Test
    void unknownDifficulty_returns400() {
        ExamRequest request = new ExamRequest();
        request.setCode("CRUD_BAD_DIFFICULTY_EXAM");
        request.setName("Bad Difficulty");
        request.setActive(false);
        request.setDisplayOrder(61);
        request.setDifficulty("impossible");

        ResponseEntity<Map> response = restTemplate.exchange("/api/exams", HttpMethod.POST, adminAuth(request), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void unknownBadge_returns400() {
        ExamRequest request = new ExamRequest();
        request.setCode("CRUD_BAD_BADGE_EXAM");
        request.setName("Bad Badge");
        request.setActive(false);
        request.setDisplayOrder(62);
        request.setBadge("nonexistent");

        ResponseEntity<Map> response = restTemplate.exchange("/api/exams", HttpMethod.POST, adminAuth(request), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    private ExamResponse createExam(String code, String name, boolean active, int displayOrder) {
        ExamRequest request = new ExamRequest();
        request.setCode(code);
        request.setName(name);
        request.setActive(active);
        request.setDisplayOrder(displayOrder);

        ResponseEntity<ExamResponse> response = restTemplate.exchange(
                "/api/exams", HttpMethod.POST, adminAuth(request), ExamResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdExamCodes.add(response.getBody().getCode());
        return response.getBody();
    }
}
