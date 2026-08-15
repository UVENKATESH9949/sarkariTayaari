package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.CreateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.DifficultyLevelRequest;
import com.sarkaritaiyaari.backend.dto.DifficultyLevelResponse;
import com.sarkaritaiyaari.backend.repository.DifficultyLevelRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class DifficultyLevelTest extends AbstractIntegrationTest {

    @Autowired
    private DifficultyLevelRepository difficultyLevelRepository;

    private final List<String> createdCodes = new ArrayList<>();

    @AfterEach
    void cleanupLevels() {
        // Questions reference difficulty_levels, and this runs *before* the base-class
        // cleanup, so the questions have to go first or the level delete hits the FK.
        if (!createdIds.isEmpty()) {
            questionRepository.deleteAllById(createdIds);
            createdIds.clear();
        }
        if (!createdCodes.isEmpty()) {
            difficultyLevelRepository.deleteAllById(createdCodes);
            createdCodes.clear();
        }
    }

    @Test
    void seededLevels_areAvailableAndOrdered() {
        ResponseEntity<DifficultyLevelResponse[]> response =
                restTemplate.getForEntity("/api/difficulty-levels", DifficultyLevelResponse[].class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<String> codes = List.of(response.getBody()).stream().map(DifficultyLevelResponse::code).toList();
        assertThat(codes).containsSubsequence("easy", "medium", "hard");
    }

    @Test
    void newLevel_isUsableByAQuestionWithoutACodeChange() {
        createLevel("verify-extreme", "Extreme", 99, true);

        CreateQuestionRequest request = sampleRequest();
        request.setDifficulty("verify-extreme");

        ResponseEntity<Map> response = restTemplate.postForEntity("/api/questions", request, Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdIds.add(java.util.UUID.fromString((String) response.getBody().get("id")));
    }

    @Test
    void unknownDifficulty_returns400WithAReadableMessage() {
        CreateQuestionRequest request = sampleRequest();
        request.setDifficulty("not-a-real-level");

        ResponseEntity<Map> response = restTemplate.postForEntity("/api/questions", request, Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat((String) response.getBody().get("error")).contains("Unknown difficulty");
    }

    @Test
    void inactiveLevel_isHiddenFromTheActiveListButPresentInAll() {
        createLevel("verify-hidden", "Hidden", 98, false);

        List<String> active = List.of(restTemplate
                .getForEntity("/api/difficulty-levels", DifficultyLevelResponse[].class).getBody())
                .stream().map(DifficultyLevelResponse::code).toList();
        List<String> all = List.of(restTemplate
                .getForEntity("/api/difficulty-levels/all", DifficultyLevelResponse[].class).getBody())
                .stream().map(DifficultyLevelResponse::code).toList();

        assertThat(active).doesNotContain("verify-hidden");
        assertThat(all).contains("verify-hidden");
    }

    @Test
    void update_changesLabelAndOrder() {
        createLevel("verify-update", "Before", 97, true);

        DifficultyLevelRequest update = new DifficultyLevelRequest();
        update.setCode("verify-update");
        update.setLabel("After");
        update.setDisplayOrder(96);
        update.setActive(true);

        ResponseEntity<DifficultyLevelResponse> response = restTemplate.exchange(
                "/api/difficulty-levels/verify-update", HttpMethod.PUT,
                new HttpEntity<>(update), DifficultyLevelResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().label()).isEqualTo("After");
        assertThat(response.getBody().displayOrder()).isEqualTo(96);
    }

    private DifficultyLevelResponse createLevel(String code, String label, int displayOrder, boolean active) {
        DifficultyLevelRequest request = new DifficultyLevelRequest();
        request.setCode(code);
        request.setLabel(label);
        request.setDisplayOrder(displayOrder);
        request.setActive(active);

        ResponseEntity<DifficultyLevelResponse> response =
                restTemplate.postForEntity("/api/difficulty-levels", request, DifficultyLevelResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdCodes.add(code);
        return response.getBody();
    }
}
