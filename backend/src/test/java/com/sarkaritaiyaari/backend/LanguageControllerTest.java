package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.LanguageRequest;
import com.sarkaritaiyaari.backend.dto.LanguageResponse;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.Arrays;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

class LanguageControllerTest extends AbstractIntegrationTest {

    @Test
    void listActive_includesEnglishAndHindi() {
        ResponseEntity<LanguageResponse[]> response =
                restTemplate.getForEntity("/api/languages", LanguageResponse[].class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<String> codes = Arrays.stream(response.getBody()).map(LanguageResponse::getCode).toList();
        assertThat(codes).contains("en", "hi");
    }

    @Test
    void createThenListAll_includesInactiveLanguage() {
        createLanguage("zz", "Test Language", false);

        ResponseEntity<LanguageResponse[]> activeResponse =
                restTemplate.getForEntity("/api/languages", LanguageResponse[].class);
        ResponseEntity<LanguageResponse[]> allResponse = restTemplate.exchange(
                "/api/languages/all", HttpMethod.GET, adminAuth(), LanguageResponse[].class);

        List<String> activeCodes = Arrays.stream(activeResponse.getBody()).map(LanguageResponse::getCode).toList();
        List<String> allCodes = Arrays.stream(allResponse.getBody()).map(LanguageResponse::getCode).toList();

        assertThat(activeCodes).doesNotContain("zz");
        assertThat(allCodes).contains("zz");

        restTemplate.exchange("/api/languages/zz", HttpMethod.DELETE, adminAuth(), Void.class);
    }

    @Test
    void update_changesActiveFlag() {
        createLanguage("yy", "Another Test Language", false);

        LanguageRequest update = new LanguageRequest();
        update.setCode("yy");
        update.setName("Another Test Language");
        update.setActive(true);

        ResponseEntity<LanguageResponse> response = restTemplate.exchange(
                "/api/languages/yy", HttpMethod.PUT, adminAuth(update), LanguageResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().isActive()).isTrue();

        restTemplate.exchange("/api/languages/yy", HttpMethod.DELETE, adminAuth(), Void.class);
    }

    private void createLanguage(String code, String name, boolean active) {
        LanguageRequest request = new LanguageRequest();
        request.setCode(code);
        request.setName(name);
        request.setActive(active);

        ResponseEntity<LanguageResponse> response = restTemplate.exchange(
                "/api/languages", HttpMethod.POST, adminAuth(request), LanguageResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
    }
}
