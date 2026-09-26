package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.CreateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.QuestionResponse;
import com.sarkaritaiyaari.backend.entity.Subject;
import com.sarkaritaiyaari.backend.entity.Topic;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.util.UriComponentsBuilder;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Covers the public, filterable read endpoints backing the mobile app's hybrid
 * online/local data layer — used while a device's first-ever sync hasn't finished
 * (or has never run), so screens can read live instead of blocking on local SQLite.
 * None of these require an admin token, unlike the CRUD list they share a filter
 * predicate with (QuestionSpecifications.filter).
 */
class LiveQuestionsTest extends AbstractIntegrationTest {

    @Test
    void live_returnsOnlyNonDeletedQuestionsMatchingFilters() {
        QuestionResponse kept = createQuestion(sampleRequest());
        QuestionResponse deleted = createQuestion(sampleRequest());
        restTemplate.exchange("/api/questions/" + deleted.getId(), HttpMethod.DELETE, adminAuth(), Void.class);

        Map<?, ?> body = getForMap(UriComponentsBuilder.fromPath("/api/questions/live")
                .queryParam("topicId", testTopicId)
                .queryParam("size", 500)
                .build().toUriString());

        List<UUID> ids = idsOf(body);
        assertThat(ids).contains(kept.getId());
        assertThat(ids).doesNotContain(deleted.getId());
    }

    @Test
    void live_filtersByDifficulty() {
        CreateQuestionRequest hardRequest = sampleRequest();
        hardRequest.setDifficulty("hard");
        QuestionResponse hard = createQuestion(hardRequest);
        QuestionResponse easy = createQuestion(sampleRequest()); // sampleRequest() defaults to "easy"

        Map<?, ?> body = getForMap(UriComponentsBuilder.fromPath("/api/questions/live")
                .queryParam("topicId", testTopicId)
                .queryParam("difficulty", "hard")
                .queryParam("size", 500)
                .build().toUriString());

        List<UUID> ids = idsOf(body);
        assertThat(ids).contains(hard.getId());
        assertThat(ids).doesNotContain(easy.getId());
    }

    @Test
    void live_unmatchedFilter_returnsEmptyNotError() {
        Map<?, ?> body = getForMap("/api/questions/live?topicId=" + UUID.randomUUID());
        assertThat((List<?>) body.get("content")).isEmpty();
    }

    @Test
    void counts_groupsBySubjectAndExcludesDeleted() {
        QuestionResponse kept = createQuestion(sampleRequest());
        QuestionResponse deleted = createQuestion(sampleRequest());
        restTemplate.exchange("/api/questions/" + deleted.getId(), HttpMethod.DELETE, adminAuth(), Void.class);

        ResponseEntity<Map> response = restTemplate.getForEntity(
                "/api/questions/counts?groupBy=subject&subjectId=" + kept.getSubjectId(), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        Long count = ((Number) response.getBody().get(kept.getSubjectId().toString())).longValue();
        assertThat(count).isEqualTo(1L); // "deleted" is excluded, so only "kept" is counted
    }

    @Test
    void counts_unknownGroupBy_returns400() {
        ResponseEntity<Map> response = restTemplate.getForEntity("/api/questions/counts?groupBy=nonsense", Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void mockCount_and_mockSample_spanMultipleSubjects() {
        Subject secondSubject = new Subject();
        secondSubject.setName("Automated Test Second Subject " + UUID.randomUUID());
        secondSubject = subjectRepository.save(secondSubject);
        createdSubjectIds.add(secondSubject.getId());

        Topic secondTopic = new Topic();
        secondTopic.setSubject(secondSubject);
        secondTopic.setName("Automated Test Second Topic");
        secondTopic = topicRepository.save(secondTopic);
        createdTopicIds.add(secondTopic.getId());

        QuestionResponse inFirstSubject = createQuestion(sampleRequest());

        CreateQuestionRequest secondRequest = sampleRequest();
        secondRequest.setTopicId(secondTopic.getId());
        QuestionResponse inSecondSubject = createQuestion(secondRequest);

        String subjectIdsParam = inFirstSubject.getSubjectId() + "," + secondSubject.getId();

        Map<?, ?> countBody = getForMap(
                "/api/questions/mock-count?examCode=" + TEST_EXAM_CODE + "&subjectIds=" + subjectIdsParam);
        assertThat(((Number) countBody.get("count")).longValue()).isGreaterThanOrEqualTo(2L);

        ResponseEntity<List> sampleResponse = restTemplate.getForEntity(
                "/api/questions/mock-sample?examCode=" + TEST_EXAM_CODE + "&subjectIds=" + subjectIdsParam + "&limit=2",
                List.class);
        assertThat(sampleResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(sampleResponse.getBody()).hasSize(2);

        List<String> sampledSubjectIds = ((List<Map<String, Object>>) (List<?>) sampleResponse.getBody()).stream()
                .map(q -> (String) q.get("subjectId"))
                .toList();
        assertThat(sampledSubjectIds).allMatch(id ->
                id.equals(inFirstSubject.getSubjectId().toString()) || id.equals(inSecondSubject.getSubjectId().toString()));
    }

    @Test
    void mockSample_excludesDeletedQuestions() {
        QuestionResponse deleted = createQuestion(sampleRequest());
        restTemplate.exchange("/api/questions/" + deleted.getId(), HttpMethod.DELETE, adminAuth(), Void.class);

        ResponseEntity<List> response = restTemplate.getForEntity(
                "/api/questions/mock-sample?examCode=" + TEST_EXAM_CODE + "&subjectIds=" + deleted.getSubjectId() + "&limit=500",
                List.class);
        List<String> ids = ((List<Map<String, Object>>) (List<?>) response.getBody()).stream()
                .map(q -> (String) q.get("id"))
                .toList();
        assertThat(ids).doesNotContain(deleted.getId().toString());
    }

    /**
     * The Mock Test Hub's ad-hoc formats (Topic/Difficulty/PYQ Mock) narrow this same
     * subject-scoped endpoint further — all three are optional and additive, proven here
     * against the exact same fixture shape {@link #mockCount_and_mockSample_spanMultipleSubjects}
     * already uses for the un-narrowed case, so a regression in either would show up as an
     * asymmetry between these tests rather than each looking correct in isolation.
     */
    @Test
    void mockCountAndMockSample_narrowByTopicId() {
        Subject defaultSubject = topicRepository.findById(testTopicId).orElseThrow().getSubject();
        Topic secondTopic = new Topic();
        secondTopic.setSubject(defaultSubject);
        secondTopic.setName("Automated Test Second Topic For Mock Narrowing");
        secondTopic = topicRepository.save(secondTopic);
        createdTopicIds.add(secondTopic.getId());

        QuestionResponse inFirstTopic = createQuestion(sampleRequest());

        CreateQuestionRequest secondTopicRequest = sampleRequest();
        secondTopicRequest.setTopicId(secondTopic.getId());
        QuestionResponse inSecondTopic = createQuestion(secondTopicRequest);

        Map<?, ?> countBody = getForMap("/api/questions/mock-count?examCode=" + TEST_EXAM_CODE
                + "&subjectIds=" + inFirstTopic.getSubjectId() + "&topicIds=" + testTopicId);
        assertThat(((Number) countBody.get("count")).longValue()).isEqualTo(1L);

        ResponseEntity<List> sampleResponse = restTemplate.getForEntity(
                "/api/questions/mock-sample?examCode=" + TEST_EXAM_CODE
                        + "&subjectIds=" + inFirstTopic.getSubjectId() + "&topicIds=" + testTopicId + "&limit=50",
                List.class);
        List<String> ids = ((List<Map<String, Object>>) (List<?>) sampleResponse.getBody()).stream()
                .map(q -> (String) q.get("id"))
                .toList();
        assertThat(ids).contains(inFirstTopic.getId().toString());
        assertThat(ids).doesNotContain(inSecondTopic.getId().toString());
    }

    @Test
    void mockSample_narrowByDifficultyCode() {
        CreateQuestionRequest hardRequest = sampleRequest();
        hardRequest.setDifficulty("hard");
        QuestionResponse hard = createQuestion(hardRequest);
        QuestionResponse easy = createQuestion(sampleRequest()); // sampleRequest() defaults to "easy"

        ResponseEntity<List> response = restTemplate.getForEntity(
                "/api/questions/mock-sample?examCode=" + TEST_EXAM_CODE
                        + "&subjectIds=" + hard.getSubjectId() + "&difficultyCode=hard&limit=50",
                List.class);
        List<String> ids = ((List<Map<String, Object>>) (List<?>) response.getBody()).stream()
                .map(q -> (String) q.get("id"))
                .toList();
        assertThat(ids).contains(hard.getId().toString());
        assertThat(ids).doesNotContain(easy.getId().toString());
    }

    @Test
    void mockCountAndMockSample_narrowByPyqOnly() {
        CreateQuestionRequest pyqRequest = sampleRequest();
        pyqRequest.setPyq(true);
        QuestionResponse pyq = createQuestion(pyqRequest);
        QuestionResponse nonPyq = createQuestion(sampleRequest());

        Map<?, ?> countBody = getForMap("/api/questions/mock-count?examCode=" + TEST_EXAM_CODE
                + "&subjectIds=" + pyq.getSubjectId() + "&pyqOnly=true");
        assertThat(((Number) countBody.get("count")).longValue()).isEqualTo(1L);

        ResponseEntity<List> sampleResponse = restTemplate.getForEntity(
                "/api/questions/mock-sample?examCode=" + TEST_EXAM_CODE
                        + "&subjectIds=" + pyq.getSubjectId() + "&pyqOnly=true&limit=50",
                List.class);
        List<String> ids = ((List<Map<String, Object>>) (List<?>) sampleResponse.getBody()).stream()
                .map(q -> (String) q.get("id"))
                .toList();
        assertThat(ids).contains(pyq.getId().toString());
        assertThat(ids).doesNotContain(nonPyq.getId().toString());
    }

    private Map<?, ?> getForMap(String url) {
        ResponseEntity<Map> response = restTemplate.getForEntity(url, Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody();
    }

    private List<UUID> idsOf(Map<?, ?> pageBody) {
        List<Map<?, ?>> content = (List<Map<?, ?>>) pageBody.get("content");
        return content.stream().map(q -> UUID.fromString((String) q.get("id"))).toList();
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
