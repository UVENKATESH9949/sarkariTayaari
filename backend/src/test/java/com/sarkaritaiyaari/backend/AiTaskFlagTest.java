package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.entity.AiTaskId;
import com.sarkaritaiyaari.backend.repository.AiTaskFlagRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TASK-2701 Phase 4 — per-task AI flags and the public client-config feed built from them.
 */
class AiTaskFlagTest extends AbstractIntegrationTest {

    @Autowired
    private AiTaskFlagRepository aiTaskFlagRepository;

    @BeforeEach
    @AfterEach
    void resetFlags() {
        aiTaskFlagRepository.deleteById(AiTaskId.QUESTION_EXPLANATION);
    }

    @SuppressWarnings("unchecked")
    @Test
    void clientConfig_defaultsEveryKnownTaskToDisabled_andNeedsNoAuth() {
        ResponseEntity<Map> response = restTemplate.getForEntity("/api/client-config", Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        Map<String, Object> aiTasks = (Map<String, Object>) response.getBody().get("aiTasks");
        assertThat(aiTasks).containsEntry("QUESTION_EXPLANATION", false);
        assertThat(aiTasks).containsKeys(
                "QUESTION_HINT", "CONCEPT_EXPLANATION", "MISTAKE_ANALYSIS", "PERSONALIZED_RECOMMENDATION",
                "STUDY_PLAN", "TOPIC_ANALYSIS", "PERSONALIZED_EXPLANATION", "QUESTION_CLASSIFICATION");
    }

    @SuppressWarnings("unchecked")
    @Test
    void adminCanEnableATask_andItThenAppearsInClientConfig() {
        ResponseEntity<Map> updated = restTemplate.exchange("/api/admin/ai-task-flags/QUESTION_EXPLANATION",
                HttpMethod.PUT, adminAuth(Map.of("enabled", true, "expectedVersion", 0)), Map.class);

        assertThat(updated.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(updated.getBody().get("enabled")).isEqualTo(true);

        Map<String, Object> config = restTemplate.getForEntity("/api/client-config", Map.class).getBody();
        Map<String, Object> aiTasks = (Map<String, Object>) config.get("aiTasks");
        assertThat(aiTasks).containsEntry("QUESTION_EXPLANATION", true);
    }

    @Test
    void listAndUpdate_rejectUnauthenticatedAndNonAdminCallers() {
        assertThat(restTemplate.getForEntity("/api/admin/ai-task-flags", Map.class).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);

        ResponseEntity<Map> studentList = restTemplate.exchange("/api/admin/ai-task-flags", HttpMethod.GET,
                sharedStudentAuth(), Map.class);
        assertThat(studentList.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);

        ResponseEntity<Map> studentUpdate = restTemplate.exchange("/api/admin/ai-task-flags/QUESTION_EXPLANATION",
                HttpMethod.PUT, sharedStudentAuth(Map.of("enabled", true, "expectedVersion", 0)), Map.class);
        assertThat(studentUpdate.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);

        ResponseEntity<Map> reviewerUpdate = restTemplate.exchange("/api/admin/ai-task-flags/QUESTION_EXPLANATION",
                HttpMethod.PUT, reviewerAuth(Map.of("enabled", true, "expectedVersion", 0)), Map.class);
        assertThat(reviewerUpdate.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void update_rejectsAnUnknownTaskId() {
        ResponseEntity<Map> response = restTemplate.exchange("/api/admin/ai-task-flags/NOT_A_REAL_TASK",
                HttpMethod.PUT, adminAuth(Map.of("enabled", true, "expectedVersion", 0)), Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void update_rejectsAStaleVersion() {
        restTemplate.exchange("/api/admin/ai-task-flags/QUESTION_EXPLANATION", HttpMethod.PUT,
                adminAuth(Map.of("enabled", true, "expectedVersion", 0)), Map.class);

        ResponseEntity<Map> stale = restTemplate.exchange("/api/admin/ai-task-flags/QUESTION_EXPLANATION",
                HttpMethod.PUT, adminAuth(Map.of("enabled", false, "expectedVersion", 0)), Map.class);

        assertThat(stale.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
    }

    @SuppressWarnings("unchecked")
    @Test
    void list_showsEveryKnownTaskIncludingOnesNeverToggled() {
        ResponseEntity<Map> response = restTemplate.exchange("/api/admin/ai-task-flags", HttpMethod.GET,
                adminAuth(), Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<Map<String, Object>> flags = (List<Map<String, Object>>) response.getBody().get("flags");
        assertThat(flags).hasSize(AiTaskId.values().length);
        assertThat(flags).extracting(f -> f.get("taskId")).contains("STUDY_PLAN", "TOPIC_ANALYSIS");
    }
}
