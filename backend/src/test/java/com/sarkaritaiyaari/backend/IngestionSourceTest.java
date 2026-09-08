package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.IngestionAdminDtos.IngestionSourceRequest;
import com.sarkaritaiyaari.backend.dto.IngestionAdminDtos.IngestionSourceResponse;
import com.sarkaritaiyaari.backend.repository.IngestionSourceRepository;
import org.junit.jupiter.api.AfterEach;
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
 * TASK-2401 Task 2 -- Source Registry CRUD only. No discovery/scanning exists yet, so
 * this test never fetches anything from a real external site.
 */
class IngestionSourceTest extends AbstractIntegrationTest {

    @Autowired
    private IngestionSourceRepository ingestionSourceRepository;

    private final List<UUID> createdSourceIds = new ArrayList<>();

    @AfterEach
    void cleanupSources() {
        if (!createdSourceIds.isEmpty()) {
            ingestionSourceRepository.deleteAllById(createdSourceIds);
            createdSourceIds.clear();
        }
    }

    private IngestionSourceRequest sampleRequest(String name) {
        return new IngestionSourceRequest(
                "Staff Selection Commission",
                name,
                "https://ssc.gov.in",
                "API",
                "ssc_notice_board_v1",
                Map.of("allowedPathPrefix", "/api/attachment/uploads/masterData/"),
                true,
                1440);
    }

    @Test
    void create_persistsAndIsListed() {
        String uniqueName = "IngestionSourceTest verify create " + UUID.randomUUID();
        ResponseEntity<IngestionSourceResponse> response = restTemplate.exchange(
                "/api/admin/ingestion/sources", HttpMethod.POST,
                adminAuth(sampleRequest(uniqueName)), IngestionSourceResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody().name()).isEqualTo(uniqueName);
        assertThat(response.getBody().sourceType()).isEqualTo("API");
        assertThat(response.getBody().active()).isTrue();
        assertThat(response.getBody().config()).containsEntry("allowedPathPrefix", "/api/attachment/uploads/masterData/");
        createdSourceIds.add(response.getBody().id());

        ResponseEntity<IngestionSourceResponse[]> listResponse = restTemplate.exchange(
                "/api/admin/ingestion/sources", HttpMethod.GET, adminAuth(), IngestionSourceResponse[].class);
        assertThat(List.of(listResponse.getBody()).stream().map(IngestionSourceResponse::id))
                .contains(response.getBody().id());
    }

    @Test
    void update_changesFields() {
        ResponseEntity<IngestionSourceResponse> created = restTemplate.exchange(
                "/api/admin/ingestion/sources", HttpMethod.POST,
                adminAuth(sampleRequest("IngestionSourceTest verify update " + UUID.randomUUID())),
                IngestionSourceResponse.class);
        UUID id = created.getBody().id();
        createdSourceIds.add(id);

        IngestionSourceRequest update = new IngestionSourceRequest(
                "Staff Selection Commission",
                "Renamed Notice Board",
                "https://ssc.gov.in",
                "API",
                "ssc_notice_board_v1",
                null,
                false,
                720);

        ResponseEntity<IngestionSourceResponse> response = restTemplate.exchange(
                "/api/admin/ingestion/sources/" + id, HttpMethod.PUT, adminAuth(update), IngestionSourceResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().name()).isEqualTo("Renamed Notice Board");
        assertThat(response.getBody().active()).isFalse();
        assertThat(response.getBody().checkFrequencyMinutes()).isEqualTo(720);
        assertThat(response.getBody().config()).isNull();
    }

    @Test
    void delete_removesIt() {
        ResponseEntity<IngestionSourceResponse> created = restTemplate.exchange(
                "/api/admin/ingestion/sources", HttpMethod.POST,
                adminAuth(sampleRequest("IngestionSourceTest verify delete " + UUID.randomUUID())),
                IngestionSourceResponse.class);
        UUID id = created.getBody().id();

        ResponseEntity<Void> response = restTemplate.exchange(
                "/api/admin/ingestion/sources/" + id, HttpMethod.DELETE, adminAuth(), Void.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(ingestionSourceRepository.existsById(id)).isFalse();
    }

    @Test
    void unknownSourceType_returns400() {
        IngestionSourceRequest badRequest = new IngestionSourceRequest(
                "Staff Selection Commission", "Bad type", "https://ssc.gov.in",
                "NOT_A_REAL_TYPE", "ssc_notice_board_v1", null, true, 1440);

        ResponseEntity<Map> response = restTemplate.exchange(
                "/api/admin/ingestion/sources", HttpMethod.POST, adminAuth(badRequest), Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void nonAdminToken_isRejected() {
        ResponseEntity<Map> response = restTemplate.exchange(
                "/api/admin/ingestion/sources", HttpMethod.GET, sharedStudentAuth(), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }
}
