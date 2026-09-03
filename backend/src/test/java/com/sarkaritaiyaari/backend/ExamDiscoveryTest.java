package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.ExamDiscoveryDtos.ExamCardResponse;
import com.sarkaritaiyaari.backend.dto.ExamDiscoveryDtos.PagedExamCards;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.RecruitmentCycleRequest;
import com.sarkaritaiyaari.backend.dto.ExamRequest;
import com.sarkaritaiyaari.backend.dto.ExamResponse;
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
 * The Exams discovery module's own listing (spec §5-15): pagination, sorting, status and
 * category filtering, and the computed closing-soon/primary-action fields. Uses its own
 * small set of throwaway exams (not {@code TEST_EXAM_CODE}, which is shared across the
 * whole suite and has no controlled dates/category) so sort order is unambiguous.
 */
class ExamDiscoveryTest extends AbstractIntegrationTest {

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

    private String examCode(String suffix) {
        return "DISC_" + runId + "_" + suffix;
    }

    private ExamResponse createExam(String suffix, String name, String category, int displayOrder) {
        ExamRequest request = new ExamRequest();
        request.setCode(examCode(suffix));
        request.setName(name);
        request.setActive(true);
        request.setDisplayOrder(displayOrder);
        request.setCategory(category);

        ResponseEntity<ExamResponse> response = restTemplate.exchange(
                "/api/exams", HttpMethod.POST, adminAuth(request), ExamResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdExamCodes.add(response.getBody().getCode());
        return response.getBody();
    }

    /** Creates a PUBLISHED, current cycle for the exam with the given status/deadline. */
    private void createCurrentCycle(String examCode, String status, LocalDate applicationEnd, LocalDate examStart) {
        RecruitmentCycleRequest request = new RecruitmentCycleRequest(
                examCode, "Discovery Test " + runId, status,
                LocalDate.now(), LocalDate.now().minusDays(30), applicationEnd,
                examStart, examStart != null ? examStart.plusDays(5) : null,
                100, null, null, true, false, null, "PUBLISHED");
        ResponseEntity<Object> response = restTemplate.exchange(
                "/api/recruitment-cycles", HttpMethod.POST, adminAuth(request), Object.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        // Extract the id from the raw map response rather than adding a DTO import just for this.
        @SuppressWarnings("unchecked")
        var body = (java.util.Map<String, Object>) response.getBody();
        createdCycleIds.add(UUID.fromString((String) body.get("id")));
    }

    private PagedExamCards discover(String query) {
        ResponseEntity<PagedExamCards> response = restTemplate.exchange(
                "/api/exams/discover" + query, HttpMethod.GET, null, PagedExamCards.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody();
    }

    @Test
    void examWithNoCurrentCycle_stillAppearsWithNullStatusAndViewExamAction() {
        createExam("NOCYCLE", "No Cycle Exam", "SSC", 500);

        PagedExamCards page = discover("?size=200");
        ExamCardResponse card = findCard(page, examCode("NOCYCLE"));

        assertThat(card.status()).isNull();
        assertThat(card.primaryAction()).isEqualTo("VIEW_EXAM");
        assertThat(card.closingSoon()).isFalse();
    }

    @Test
    void applicationOpen_computesDaysUntilDeadlineAndClosingSoon() {
        ExamResponse exam = createExam("CLOSING", "Closing Soon Exam", "Banking", 501);
        createCurrentCycle(exam.getCode(), "APPLICATION_OPEN", LocalDate.now().plusDays(5), null);

        PagedExamCards page = discover("?size=200");
        ExamCardResponse card = findCard(page, exam.getCode());

        assertThat(card.status()).isEqualTo("APPLICATION_OPEN");
        assertThat(card.daysUntilDeadline()).isEqualTo(5);
        assertThat(card.closingSoon()).isTrue();
        assertThat(card.primaryAction()).isEqualTo("VIEW_EXAM"); // no notificationUrl set
    }

    @Test
    void applicationOpenFarFromDeadline_isNotClosingSoon() {
        ExamResponse exam = createExam("FAR", "Far Deadline Exam", "Banking", 502);
        createCurrentCycle(exam.getCode(), "APPLICATION_OPEN", LocalDate.now().plusDays(60), null);

        ExamCardResponse card = findCard(discover("?size=200"), exam.getCode());
        assertThat(card.closingSoon()).isFalse();
    }

    @Test
    void examUpcomingStatus_mapsToPrepareNowAction() {
        ExamResponse exam = createExam("UPCOMING", "Upcoming Exam", "UPSC", 503);
        createCurrentCycle(exam.getCode(), "EXAM_UPCOMING", null, LocalDate.now().plusDays(20));

        ExamCardResponse card = findCard(discover("?size=200"), exam.getCode());
        assertThat(card.primaryAction()).isEqualTo("PREPARE_NOW");
    }

    @Test
    void resultReleasedStatus_mapsToViewResultInfoAction() {
        ExamResponse exam = createExam("RESULT", "Result Exam", "UPSC", 504);
        createCurrentCycle(exam.getCode(), "RESULT_RELEASED", null, null);

        ExamCardResponse card = findCard(discover("?size=200"), exam.getCode());
        assertThat(card.primaryAction()).isEqualTo("VIEW_RESULT_INFO");
    }

    @Test
    void sortByDeadline_ordersNearestFirst() {
        ExamResponse near = createExam("NEAR", "Near Deadline", "SSC", 505);
        ExamResponse far = createExam("FARSORT", "Far Deadline", "SSC", 506);
        createCurrentCycle(near.getCode(), "APPLICATION_OPEN", LocalDate.now().plusDays(2), null);
        createCurrentCycle(far.getCode(), "APPLICATION_OPEN", LocalDate.now().plusDays(90), null);

        PagedExamCards page = discover("?size=200&sort=deadline");
        int nearIndex = indexOf(page, near.getCode());
        int farIndex = indexOf(page, far.getCode());
        assertThat(nearIndex).isLessThan(farIndex);
    }

    @Test
    void filterByCategory_onlyReturnsMatchingCategory() {
        createExam("CATSSC", "SSC Cat Exam", "SSC", 507);
        createExam("CATBANK", "Banking Cat Exam", "Banking", 508);

        PagedExamCards page = discover("?size=200&category=Banking");
        assertThat(page.content()).extracting(ExamCardResponse::examCode).contains(examCode("CATBANK"));
        assertThat(page.content()).extracting(ExamCardResponse::examCode).doesNotContain(examCode("CATSSC"));
    }

    @Test
    void filterByClosingSoon_onlyReturnsUrgentOpenApplications() {
        ExamResponse urgent = createExam("URGENT", "Urgent Exam", "SSC", 509);
        ExamResponse relaxed = createExam("RELAXED", "Relaxed Exam", "SSC", 510);
        createCurrentCycle(urgent.getCode(), "APPLICATION_OPEN", LocalDate.now().plusDays(1), null);
        createCurrentCycle(relaxed.getCode(), "APPLICATION_OPEN", LocalDate.now().plusDays(90), null);

        PagedExamCards page = discover("?size=200&status=CLOSING_SOON");
        assertThat(page.content()).extracting(ExamCardResponse::examCode).contains(urgent.getCode());
        assertThat(page.content()).extracting(ExamCardResponse::examCode).doesNotContain(relaxed.getCode());
    }

    @Test
    void pagination_respectsPageAndSizeAndReportsHasMore() {
        for (int i = 0; i < 5; i++) {
            createExam("PAGE" + i, "Page Exam " + i, "Other", 520 + i);
        }

        PagedExamCards firstPage = discover("?size=2&page=0&category=Other&sort=alphabetical");
        assertThat(firstPage.content()).hasSize(2);
        assertThat(firstPage.hasMore()).isTrue();
        assertThat(firstPage.totalElements()).isGreaterThanOrEqualTo(5);

        PagedExamCards lastPage = discover("?size=2&page=2&category=Other&sort=alphabetical");
        assertThat(lastPage.content()).hasSize(1);
        assertThat(lastPage.hasMore()).isFalse();
    }

    private ExamCardResponse findCard(PagedExamCards page, String examCode) {
        return page.content().stream()
                .filter(c -> c.examCode().equals(examCode))
                .findFirst()
                .orElseThrow(() -> new AssertionError("Card not found for " + examCode));
    }

    private int indexOf(PagedExamCards page, String examCode) {
        for (int i = 0; i < page.content().size(); i++) {
            if (page.content().get(i).examCode().equals(examCode)) return i;
        }
        throw new AssertionError("Card not found for " + examCode);
    }
}
