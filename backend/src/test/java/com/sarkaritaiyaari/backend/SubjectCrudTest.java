package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.SubjectRequest;
import com.sarkaritaiyaari.backend.dto.SubjectResponse;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class SubjectCrudTest extends AbstractIntegrationTest {

    @Test
    void createThenGet_returnsSameData() {
        SubjectResponse created = createSubject("CRUD Test Subject A");

        ResponseEntity<SubjectResponse> response = restTemplate.exchange(
                "/api/subjects/" + created.getId(), HttpMethod.GET, adminAuth(), SubjectResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().getName()).isEqualTo("CRUD Test Subject A");
    }

    @Test
    void list_includesCreatedSubject() {
        SubjectResponse created = createSubject("CRUD Test Subject B");

        ResponseEntity<SubjectResponse[]> response = restTemplate.getForEntity("/api/subjects", SubjectResponse[].class);
        List<String> names = List.of(response.getBody()).stream().map(SubjectResponse::getName).toList();

        assertThat(names).contains(created.getName());
    }

    @Test
    void update_changesName() {
        SubjectResponse created = createSubject("CRUD Test Subject C");

        SubjectRequest update = new SubjectRequest();
        update.setName("CRUD Test Subject C Renamed");

        ResponseEntity<SubjectResponse> response = restTemplate.exchange(
                "/api/subjects/" + created.getId(), HttpMethod.PUT, adminAuth(update), SubjectResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().getName()).isEqualTo("CRUD Test Subject C Renamed");
    }

    @Test
    void duplicateName_returns400() {
        createSubject("CRUD Test Subject D");

        SubjectRequest duplicate = new SubjectRequest();
        duplicate.setName("CRUD Test Subject D");

        ResponseEntity<Map> response = restTemplate.exchange("/api/subjects", HttpMethod.POST, adminAuth(duplicate), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    private SubjectResponse createSubject(String name) {
        SubjectRequest request = new SubjectRequest();
        request.setName(name);

        ResponseEntity<SubjectResponse> response = restTemplate.exchange(
                "/api/subjects", HttpMethod.POST, adminAuth(request), SubjectResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdSubjectIds.add(response.getBody().getId());
        return response.getBody();
    }
}
