package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.CareerPostRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.CareerPostResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideDtos.PreparePlanResponse;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Coverage-ledger closure, Phase C: §22 "Personalized Preparation Roadmap" and §25/§26
 * "Career Information/Growth" — both genuinely new endpoints this session.
 */
class PreparePlanAndCareerPostTest extends AbstractIntegrationTest {

    private final List<UUID> createdCareerPostIds = new ArrayList<>();

    @AfterEach
    void cleanupCareerPosts() {
        for (UUID id : createdCareerPostIds) {
            restTemplate.exchange("/api/career-posts/" + id, HttpMethod.DELETE, adminAuth(), Void.class);
        }
        createdCareerPostIds.clear();
    }

    @Test
    void preparePlan_wellFormedForTheSharedFixtureExam() {
        // NOT asserted empty: TEST_EXAM_CODE's fixture topic is shared across the whole
        // suite (per AbstractIntegrationTest's own doc comment), and another test class
        // (Epic L intelligence) can leave a real computed TopicPriority row behind for it
        // -- found by running this against the real suite, not assumed. So this asserts
        // the response's actual invariants instead of a specific row count: at most one
        // recommended topic, and priority-descending order whenever there's more than one.
        ResponseEntity<PreparePlanResponse> response = restTemplate.exchange(
                "/api/exams/" + TEST_EXAM_CODE + "/prepare-plan", HttpMethod.GET, null, PreparePlanResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        PreparePlanResponse body = response.getBody();
        assertThat(body.examCode()).isEqualTo(TEST_EXAM_CODE);
        assertThat(body.topics()).filteredOn(t -> t.recommended()).hasSizeLessThanOrEqualTo(1);
        for (int i = 1; i < body.topics().size(); i++) {
            var prev = body.topics().get(i - 1).finalPriority();
            var curr = body.topics().get(i).finalPriority();
            if (prev != null && curr != null) {
                assertThat(prev.compareTo(curr)).isGreaterThanOrEqualTo(0);
            }
        }
    }

    @Test
    void preparePlan_404sForAnUnknownExam() {
        ResponseEntity<PreparePlanResponse> response = restTemplate.exchange(
                "/api/exams/DOES_NOT_EXIST/prepare-plan", HttpMethod.GET, null, PreparePlanResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void careerPost_roundTripsAndAppearsInTheGuideThenDisappearsOnDelete() {
        CareerPostRequest request = new CareerPostRequest(
                TEST_EXAM_CODE, "Automated Test Post", "Level 6", 35000, 90000,
                "Promoted after 4 years.", "A test post.", null, 0);

        ResponseEntity<CareerPostResponse> created = restTemplate.exchange(
                "/api/career-posts", HttpMethod.POST, adminAuth(request), CareerPostResponse.class);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        UUID id = created.getBody().id();
        createdCareerPostIds.add(id);
        assertThat(created.getBody().postTitle()).isEqualTo("Automated Test Post");

        // Career posts are exam-scoped, not cycle-scoped (see the V19 migration comment) --
        // TEST_EXAM_CODE has no recruitment cycle at all, so the combined guide endpoint
        // 404s ("no current cycle configured") exactly like it did before this feature
        // existed. The list endpoint is career posts' own read path, unaffected by that gate.
        ResponseEntity<CareerPostResponse[]> list = restTemplate.exchange(
                "/api/exams/" + TEST_EXAM_CODE + "/career-posts", HttpMethod.GET, adminAuth(), CareerPostResponse[].class);
        assertThat(list.getBody()).extracting(CareerPostResponse::id).contains(id);

        restTemplate.exchange("/api/career-posts/" + id, HttpMethod.DELETE, adminAuth(), Void.class);
        createdCareerPostIds.remove(id);

        ResponseEntity<CareerPostResponse[]> afterDelete = restTemplate.exchange(
                "/api/exams/" + TEST_EXAM_CODE + "/career-posts", HttpMethod.GET, adminAuth(), CareerPostResponse[].class);
        assertThat(afterDelete.getBody()).extracting(CareerPostResponse::id).doesNotContain(id);
    }

    @Test
    void careerPost_cannotBeMovedToADifferentExam() {
        CareerPostRequest request = new CareerPostRequest(
                TEST_EXAM_CODE, "Automated Test Post 2", null, null, null, null, null, null, 0);
        ResponseEntity<CareerPostResponse> created = restTemplate.exchange(
                "/api/career-posts", HttpMethod.POST, adminAuth(request), CareerPostResponse.class);
        UUID id = created.getBody().id();
        createdCareerPostIds.add(id);

        CareerPostRequest moved = new CareerPostRequest(
                "SSC_CGL", "Automated Test Post 2", null, null, null, null, null, null, 0);
        ResponseEntity<String> response = restTemplate.exchange(
                "/api/career-posts/" + id, HttpMethod.PUT, adminAuth(moved), String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void careerPostCreate_requiresAdmin() {
        CareerPostRequest request = new CareerPostRequest(
                TEST_EXAM_CODE, "Should not be created", null, null, null, null, null, null, 0);
        ResponseEntity<String> response = restTemplate.postForEntity("/api/career-posts", request, String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }
}
