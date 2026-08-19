package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.SubjectRequest;
import com.sarkaritaiyaari.backend.dto.SubjectResponse;
import com.sarkaritaiyaari.backend.dto.TopicRequest;
import com.sarkaritaiyaari.backend.dto.TopicResponse;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

class TopicCrudTest extends AbstractIntegrationTest {

    @Test
    void createThenGet_returnsSameData() {
        UUID subjectId = createSubject("CRUD Topic Parent Subject A");
        TopicResponse created = createTopic(subjectId, "Percentages A");

        ResponseEntity<TopicResponse> response = restTemplate.exchange(
                "/api/topics/" + created.getId(), HttpMethod.GET, adminAuth(), TopicResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().getName()).isEqualTo("Percentages A");
        assertThat(response.getBody().getSubjectId()).isEqualTo(subjectId);
    }

    @Test
    void listBySubjectId_onlyReturnsThatSubjectsTopics() {
        UUID subjectA = createSubject("CRUD Topic Parent Subject B");
        UUID subjectB = createSubject("CRUD Topic Parent Subject C");
        createTopic(subjectA, "Topic Under B");
        createTopic(subjectB, "Topic Under C");

        ResponseEntity<TopicResponse[]> response =
                restTemplate.getForEntity("/api/topics?subjectId=" + subjectA, TopicResponse[].class);
        List<String> names = List.of(response.getBody()).stream().map(TopicResponse::getName).toList();

        assertThat(names).contains("Topic Under B");
        assertThat(names).doesNotContain("Topic Under C");
    }

    @Test
    void update_changesNameAndSubject() {
        UUID subjectA = createSubject("CRUD Topic Parent Subject D");
        UUID subjectB = createSubject("CRUD Topic Parent Subject E");
        TopicResponse created = createTopic(subjectA, "Movable Topic");

        TopicRequest update = new TopicRequest();
        update.setSubjectId(subjectB);
        update.setName("Moved Topic");

        ResponseEntity<TopicResponse> response = restTemplate.exchange(
                "/api/topics/" + created.getId(), HttpMethod.PUT, adminAuth(update), TopicResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().getName()).isEqualTo("Moved Topic");
        assertThat(response.getBody().getSubjectId()).isEqualTo(subjectB);
    }

    @Test
    void unknownSubjectId_returns400() {
        TopicRequest request = new TopicRequest();
        request.setSubjectId(UUID.randomUUID());
        request.setName("Orphan Topic");

        ResponseEntity<?> response = restTemplate.exchange("/api/topics", HttpMethod.POST, adminAuth(request), Object.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    private UUID createSubject(String name) {
        SubjectRequest request = new SubjectRequest();
        request.setName(name);
        ResponseEntity<SubjectResponse> response = restTemplate.exchange(
                "/api/subjects", HttpMethod.POST, adminAuth(request), SubjectResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        UUID id = response.getBody().getId();
        createdSubjectIds.add(id);
        return id;
    }

    private TopicResponse createTopic(UUID subjectId, String name) {
        TopicRequest request = new TopicRequest();
        request.setSubjectId(subjectId);
        request.setName(name);

        ResponseEntity<TopicResponse> response = restTemplate.exchange(
                "/api/topics", HttpMethod.POST, adminAuth(request), TopicResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdTopicIds.add(response.getBody().getId());
        return response.getBody();
    }
}
