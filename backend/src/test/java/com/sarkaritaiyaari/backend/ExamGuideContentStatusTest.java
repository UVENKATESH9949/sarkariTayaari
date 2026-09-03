package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.RecruitmentCycleRequest;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.RecruitmentCycleResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideDtos.CycleComparisonResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideDtos.ExamGuideResponse;
import com.sarkaritaiyaari.backend.repository.RecruitmentCycleRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Exam Guide content-validation states (spec §36) and the cycle-to-cycle diff (spec §30)
 * added in the coverage-ledger closure pass. Neither `RecruitmentCycle` nor any other part
 * of the Exam Guide model (V17) had test coverage before this — confirmed by grep before
 * writing this file — so this also covers the pre-existing draft/current/public-read
 * interaction, not just the two new behaviours.
 */
class ExamGuideContentStatusTest extends AbstractIntegrationTest {

    @Autowired
    private RecruitmentCycleRepository cycleRepository;

    private final String runId = UUID.randomUUID().toString().substring(0, 8);
    private final List<UUID> createdCycleIds = new ArrayList<>();

    @AfterEach
    void cleanupCycles() {
        if (!createdCycleIds.isEmpty()) {
            cycleRepository.deleteAllById(createdCycleIds);
            createdCycleIds.clear();
        }
    }

    private RecruitmentCycleRequest request(String cycleName, LocalDate applicationEnd, Integer vacancyCount,
                                             boolean current, String contentStatus) {
        return request(cycleName, LocalDate.of(2027, 1, 15), applicationEnd, vacancyCount, current, contentStatus);
    }

    /** applicationStart varies too — needed by the diff test, since §30's "previous cycle"
     * is now ordered by real-world chronology (applicationStart first), not createdAt. */
    private RecruitmentCycleRequest request(String cycleName, LocalDate applicationStart, LocalDate applicationEnd,
                                             Integer vacancyCount, boolean current, String contentStatus) {
        return new RecruitmentCycleRequest(
                TEST_EXAM_CODE, cycleName, "APPLICATION_OPEN",
                LocalDate.of(2027, 1, 1), applicationStart, applicationEnd,
                LocalDate.of(2027, 6, 1), LocalDate.of(2027, 6, 10), vacancyCount,
                "https://example.test", null, current, false, null, contentStatus);
    }

    private RecruitmentCycleResponse createCycle(RecruitmentCycleRequest req) {
        ResponseEntity<RecruitmentCycleResponse> response = restTemplate.exchange(
                "/api/recruitment-cycles", HttpMethod.POST, adminAuth(req), RecruitmentCycleResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        RecruitmentCycleResponse body = response.getBody();
        createdCycleIds.add(body.id());
        return body;
    }

    @Test
    void newCycleDefaultsToDraftAndIsInvisibleToPublicReadsUntilPublished() {
        String cycleName = "ContentStatus Draft " + runId;
        // No contentStatus in the request -- exercises the Java-entity DRAFT default, not
        // an explicit value, since that's the path every pre-existing caller of this
        // endpoint (and the admin frontend before this session) takes.
        createCycle(request(cycleName, LocalDate.of(2027, 2, 1), 100, true, null));

        ResponseEntity<ExamGuideResponse> draftRead = restTemplate.exchange(
                "/api/exams/" + TEST_EXAM_CODE + "/guide", HttpMethod.GET, null, ExamGuideResponse.class);
        // A draft cycle must behave exactly like "no current cycle configured" to a public
        // reader -- the same empty state this feature already had before content-validation
        // states existed, not a new error shape.
        assertThat(draftRead.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

        RecruitmentCycleResponse admin = findByName(cycleName);
        assertThat(admin).isNotNull();
        assertThat(admin.contentStatus()).isEqualTo("DRAFT");

        ResponseEntity<RecruitmentCycleResponse> published = restTemplate.exchange(
                "/api/recruitment-cycles/" + admin.id() + "/publish", HttpMethod.PUT, adminAuth(),
                RecruitmentCycleResponse.class);
        assertThat(published.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(published.getBody().contentStatus()).isEqualTo("PUBLISHED");

        ResponseEntity<ExamGuideResponse> publishedRead = restTemplate.exchange(
                "/api/exams/" + TEST_EXAM_CODE + "/guide", HttpMethod.GET, null, ExamGuideResponse.class);
        assertThat(publishedRead.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(publishedRead.getBody().cycleName()).isEqualTo(cycleName);

        ResponseEntity<RecruitmentCycleResponse> unpublished = restTemplate.exchange(
                "/api/recruitment-cycles/" + admin.id() + "/unpublish", HttpMethod.PUT, adminAuth(),
                RecruitmentCycleResponse.class);
        assertThat(unpublished.getBody().contentStatus()).isEqualTo("DRAFT");
        assertThat(restTemplate.exchange("/api/exams/" + TEST_EXAM_CODE + "/guide", HttpMethod.GET, null, ExamGuideResponse.class)
                .getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void updateWithNullContentStatusLeavesItUnchanged() {
        RecruitmentCycleResponse created = createCycle(
                request("ContentStatus Keep " + runId, LocalDate.of(2027, 2, 1), 100, false, "PUBLISHED"));
        assertThat(created.contentStatus()).isEqualTo("PUBLISHED");

        RecruitmentCycleRequest update = request(created.cycleName(), LocalDate.of(2027, 2, 5), 150, false, null);
        ResponseEntity<RecruitmentCycleResponse> updated = restTemplate.exchange(
                "/api/recruitment-cycles/" + created.id(), HttpMethod.PUT, adminAuth(update), RecruitmentCycleResponse.class);
        assertThat(updated.getStatusCode()).isEqualTo(HttpStatus.OK);
        // An edit that doesn't mention contentStatus must not silently unpublish a live cycle.
        assertThat(updated.getBody().contentStatus()).isEqualTo("PUBLISHED");
        assertThat(updated.getBody().vacancyCount()).isEqualTo(150);
    }

    @Test
    void changesFromPreviousDiffsPublishedCyclesOnly() {
        // Deliberately created in the SAME order the demo seeder uses for its current vs.
        // past cycle (current row inserted first) -- this is exactly the case that broke
        // an earlier createdAt-based "previous" lookup, caught by testing against the real
        // seeded demo data rather than trusting this test's own insertion order to match.
        RecruitmentCycleResponse second = createCycle(
                request("ContentStatus Diff New " + runId, LocalDate.of(2027, 2, 1), LocalDate.of(2027, 3, 5), 150, true, "PUBLISHED"));
        RecruitmentCycleResponse first = createCycle(
                request("ContentStatus Diff Old " + runId, LocalDate.of(2026, 2, 1), LocalDate.of(2026, 3, 1), 100, false, "PUBLISHED"));

        ResponseEntity<CycleComparisonResponse> firstDiff = restTemplate.exchange(
                "/api/exams/" + TEST_EXAM_CODE + "/recruitment-cycles/" + first.id() + "/changes-from-previous",
                HttpMethod.GET, null, CycleComparisonResponse.class);
        assertThat(firstDiff.getBody().hasPrevious()).isFalse();

        ResponseEntity<CycleComparisonResponse> secondDiff = restTemplate.exchange(
                "/api/exams/" + TEST_EXAM_CODE + "/recruitment-cycles/" + second.id() + "/changes-from-previous",
                HttpMethod.GET, null, CycleComparisonResponse.class);
        CycleComparisonResponse body = secondDiff.getBody();
        assertThat(body.hasPrevious()).isTrue();
        assertThat(body.previousCycleName()).isEqualTo(first.cycleName());
        assertThat(body.changes()).anySatisfy(change -> {
            assertThat(change.field()).isEqualTo("Application closes");
            assertThat(change.previousValue()).isEqualTo("2026-03-01");
            assertThat(change.currentValue()).isEqualTo("2027-03-05");
        });
        assertThat(body.changes()).anySatisfy(change -> {
            assertThat(change.field()).isEqualTo("Vacancies");
            assertThat(change.previousValue()).isEqualTo("100");
            assertThat(change.currentValue()).isEqualTo("150");
        });
    }

    @Test
    void overviewTextRoundTripsThroughUpdateAndAppearsInThePublicGuide() {
        RecruitmentCycleResponse created = createCycle(
                request("ContentStatus Overview " + runId, LocalDate.of(2027, 2, 1), 100, true, "PUBLISHED"));
        assertThat(created.overviewText()).isNull();

        RecruitmentCycleRequest withOverview = new RecruitmentCycleRequest(
                TEST_EXAM_CODE, created.cycleName(), "APPLICATION_OPEN",
                LocalDate.of(2027, 1, 1), LocalDate.of(2027, 1, 15), LocalDate.of(2027, 2, 1),
                LocalDate.of(2027, 6, 1), LocalDate.of(2027, 6, 10), 100,
                "https://example.test", "A plain-language summary of this exam.", true, false, null, "PUBLISHED");
        ResponseEntity<RecruitmentCycleResponse> updated = restTemplate.exchange(
                "/api/recruitment-cycles/" + created.id(), HttpMethod.PUT, adminAuth(withOverview), RecruitmentCycleResponse.class);
        assertThat(updated.getBody().overviewText()).isEqualTo("A plain-language summary of this exam.");

        ResponseEntity<ExamGuideResponse> publicRead = restTemplate.exchange(
                "/api/exams/" + TEST_EXAM_CODE + "/guide", HttpMethod.GET, null, ExamGuideResponse.class);
        assertThat(publicRead.getBody().overviewText()).isEqualTo("A plain-language summary of this exam.");
    }

    @Test
    void fullReviewWorkflow_draftToReviewToPublished_thenRejectBack() {
        RecruitmentCycleResponse cycle = createCycle(
                request("Review Workflow " + runId, LocalDate.of(2027, 2, 1), 100, true, null));
        assertThat(cycle.contentStatus()).isEqualTo("DRAFT");

        // ADMIN submits for review.
        ResponseEntity<RecruitmentCycleResponse> submitted = restTemplate.exchange(
                "/api/recruitment-cycles/" + cycle.id() + "/submit-for-review", HttpMethod.PUT, adminAuth(),
                RecruitmentCycleResponse.class);
        assertThat(submitted.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(submitted.getBody().contentStatus()).isEqualTo("REVIEW");

        // A REVIEW-state cycle is still invisible to public reads, same as DRAFT.
        assertThat(restTemplate.exchange("/api/exams/" + TEST_EXAM_CODE + "/guide", HttpMethod.GET, null, ExamGuideResponse.class)
                .getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

        // REVIEWER rejects it back to DRAFT.
        ResponseEntity<RecruitmentCycleResponse> rejected = restTemplate.exchange(
                "/api/recruitment-cycles/" + cycle.id() + "/reject", HttpMethod.PUT, reviewerAuth(),
                RecruitmentCycleResponse.class);
        assertThat(rejected.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(rejected.getBody().contentStatus()).isEqualTo("DRAFT");

        // Resubmit, then REVIEWER approves (publishes).
        restTemplate.exchange("/api/recruitment-cycles/" + cycle.id() + "/submit-for-review", HttpMethod.PUT, adminAuth(),
                RecruitmentCycleResponse.class);
        ResponseEntity<RecruitmentCycleResponse> published = restTemplate.exchange(
                "/api/recruitment-cycles/" + cycle.id() + "/publish", HttpMethod.PUT, reviewerAuth(),
                RecruitmentCycleResponse.class);
        assertThat(published.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(published.getBody().contentStatus()).isEqualTo("PUBLISHED");
        assertThat(restTemplate.exchange("/api/exams/" + TEST_EXAM_CODE + "/guide", HttpMethod.GET, null, ExamGuideResponse.class)
                .getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    void adminCanAlsoPerformReviewerActions_publishDirectlyFromDraft() {
        // ADMIN is a superset of REVIEWER — publishing straight from DRAFT (skipping
        // review) must keep working, since that's every pre-existing caller's path
        // (including the demo seeder).
        RecruitmentCycleResponse cycle = createCycle(
                request("Admin Superset " + runId, LocalDate.of(2027, 2, 1), 100, false, null));
        assertThat(cycle.contentStatus()).isEqualTo("DRAFT");

        ResponseEntity<RecruitmentCycleResponse> published = restTemplate.exchange(
                "/api/recruitment-cycles/" + cycle.id() + "/publish", HttpMethod.PUT, adminAuth(),
                RecruitmentCycleResponse.class);
        assertThat(published.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(published.getBody().contentStatus()).isEqualTo("PUBLISHED");
    }

    @Test
    void reviewWorkflowEndpoints_rejectAPlainStudentToken() {
        RecruitmentCycleResponse cycle = createCycle(
                request("Role Gating " + runId, LocalDate.of(2027, 2, 1), 100, false, null));

        assertThat(restTemplate.exchange("/api/recruitment-cycles/" + cycle.id() + "/submit-for-review",
                        HttpMethod.PUT, sharedStudentAuth(), String.class).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(restTemplate.exchange("/api/recruitment-cycles/" + cycle.id() + "/reject",
                        HttpMethod.PUT, sharedStudentAuth(), String.class).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(restTemplate.exchange("/api/recruitment-cycles/" + cycle.id() + "/publish",
                        HttpMethod.PUT, sharedStudentAuth(), String.class).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
        assertThat(restTemplate.exchange("/api/recruitment-cycles/" + cycle.id() + "/unpublish",
                        HttpMethod.PUT, sharedStudentAuth(), String.class).getStatusCode())
                .isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void reviewerCannotSubmitForReview_onlyAdminAuthorsContent() {
        RecruitmentCycleResponse cycle = createCycle(
                request("Reviewer Not Author " + runId, LocalDate.of(2027, 2, 1), 100, false, null));

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/recruitment-cycles/" + cycle.id() + "/submit-for-review", HttpMethod.PUT, reviewerAuth(), String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    private RecruitmentCycleResponse findByName(String cycleName) {
        RecruitmentCycleResponse[] all = restTemplate.exchange(
                        "/api/exams/" + TEST_EXAM_CODE + "/recruitment-cycles", HttpMethod.GET, adminAuth(),
                        RecruitmentCycleResponse[].class)
                .getBody();
        for (RecruitmentCycleResponse r : all) {
            if (r.cycleName().equals(cycleName)) return r;
        }
        return null;
    }
}
