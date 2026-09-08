package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.EligibilityRuleResponse;
import com.sarkaritaiyaari.backend.dto.ExamGuideAdminDtos.RecruitmentCycleResponse;
import com.sarkaritaiyaari.backend.dto.IngestionAdminDtos.IngestionExtractionResultResponse;
import com.sarkaritaiyaari.backend.entity.ExtractionConfidence;
import com.sarkaritaiyaari.backend.entity.ExtractionMethod;
import com.sarkaritaiyaari.backend.entity.ExtractionOperation;
import com.sarkaritaiyaari.backend.entity.ExtractionTargetType;
import com.sarkaritaiyaari.backend.entity.IngestionDocument;
import com.sarkaritaiyaari.backend.entity.IngestionExtractionJob;
import com.sarkaritaiyaari.backend.entity.IngestionExtractionResult;
import com.sarkaritaiyaari.backend.entity.IngestionNotice;
import com.sarkaritaiyaari.backend.entity.IngestionSource;
import com.sarkaritaiyaari.backend.entity.IngestionSourceType;
import com.sarkaritaiyaari.backend.repository.IngestionDocumentRepository;
import com.sarkaritaiyaari.backend.repository.IngestionExtractionJobRepository;
import com.sarkaritaiyaari.backend.repository.IngestionExtractionResultRepository;
import com.sarkaritaiyaari.backend.repository.IngestionNoticeRepository;
import com.sarkaritaiyaari.backend.repository.IngestionSourceRepository;
import com.sarkaritaiyaari.backend.repository.RecruitmentCycleRepository;
import com.sarkaritaiyaari.backend.service.ExamGuideService;
import com.sarkaritaiyaari.backend.service.ReviewQueueService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * TASK-2401 Task 8 -- proves Accept is genuinely mechanical: the resulting row is
 * verified through {@link ExamGuideService}'s own existing, unchanged read methods (the
 * same ones the admin console and public API already use), not a special ingestion-only
 * check.
 */
class ReviewQueueServiceTest extends AbstractIntegrationTest {

    @Autowired
    private ReviewQueueService reviewQueueService;

    @Autowired
    private ExamGuideService examGuideService;

    @Autowired
    private IngestionExtractionResultRepository resultRepository;

    @Autowired
    private IngestionExtractionJobRepository jobRepository;

    @Autowired
    private IngestionDocumentRepository documentRepository;

    @Autowired
    private IngestionNoticeRepository ingestionNoticeRepository;

    @Autowired
    private IngestionSourceRepository ingestionSourceRepository;

    @Autowired
    private RecruitmentCycleRepository cycleRepository;

    private final List<UUID> createdSourceIds = new ArrayList<>();
    private final List<UUID> createdCycleIds = new ArrayList<>();

    @AfterEach
    void cleanup() {
        if (!createdCycleIds.isEmpty()) {
            cycleRepository.deleteAllById(createdCycleIds);
            createdCycleIds.clear();
        }
        if (!createdSourceIds.isEmpty()) {
            ingestionSourceRepository.deleteAllById(createdSourceIds);
            createdSourceIds.clear();
        }
    }

    private IngestionExtractionResult createPendingCandidate(ExtractionTargetType targetType, Map<String, Object> payload) {
        OffsetDateTime now = OffsetDateTime.now();

        IngestionSource source = new IngestionSource();
        source.setOrganization("Test Org");
        source.setName("ReviewQueueServiceTest fixture " + UUID.randomUUID());
        source.setBaseUrl("https://example.invalid");
        source.setSourceType(IngestionSourceType.API);
        source.setParserKey("unused_in_this_test");
        source.setActive(true);
        source.setCheckFrequencyMinutes(1440);
        source.setCreatedAt(now);
        source.setUpdatedAt(now);
        source = ingestionSourceRepository.save(source);
        createdSourceIds.add(source.getId());

        IngestionNotice notice = new IngestionNotice();
        notice.setSource(source);
        notice.setExternalRef("ext-" + UUID.randomUUID());
        notice.setTitle("Fixture notice");
        notice.setContentHash("fixture-hash-" + UUID.randomUUID());
        notice.setFirstSeenAt(now);
        notice.setLastSeenAt(now);
        notice = ingestionNoticeRepository.save(notice);

        IngestionDocument document = new IngestionDocument();
        document.setNotice(notice);
        document.setSourceUrl("https://example.invalid/a.pdf");
        document.setStorageUrl("https://fake-storage.invalid/a.pdf");
        document.setSha256Hash("fixturehash" + UUID.randomUUID());
        document.setFileSizeBytes(100);
        document.setMimeType("application/pdf");
        document.setCreatedAt(now);
        document = documentRepository.save(document);

        IngestionExtractionJob job = new IngestionExtractionJob();
        job.setDocument(document);
        job.setParserVersion("v1");
        job.setStatus(com.sarkaritaiyaari.backend.entity.ExtractionJobStatus.SUCCEEDED);
        job.setStartedAt(now);
        job.setFinishedAt(now);
        job = jobRepository.save(job);

        IngestionExtractionResult result = new IngestionExtractionResult();
        result.setExtractionJob(job);
        result.setTargetType(targetType);
        result.setOperation(ExtractionOperation.CREATE);
        result.setPayload(payload);
        result.setExtractionMethod(ExtractionMethod.RULE_BASED);
        result.setConfidence(ExtractionConfidence.MEDIUM);
        result.setCreatedAt(now);
        return resultRepository.save(result);
    }

    @Test
    void accept_recruitmentCycleCore_createsARealCycleVisibleThroughTheExistingReadPath() {
        IngestionExtractionResult candidate = createPendingCandidate(ExtractionTargetType.RECRUITMENT_CYCLE_CORE, Map.of(
                "cycleName", "ReviewQueueServiceTest verify " + UUID.randomUUID(),
                "applicationStart", "2026-06-09",
                "applicationEnd", "2026-07-04"));

        Map<String, Object> overrides = Map.of("examCode", TEST_EXAM_CODE, "status", "NOTIFICATION_RELEASED");
        IngestionExtractionResultResponse response = reviewQueueService.accept(candidate.getId(), overrides, null);

        assertThat(response.reviewStatus()).isEqualTo("ACCEPTED");
        assertThat(response.appliedRecruitmentCycleId()).isNotNull();
        createdCycleIds.add(response.appliedRecruitmentCycleId());

        // Verified through ExamGuideService's own existing read method -- the same one
        // the admin console and public API already use, not a special ingestion check.
        List<RecruitmentCycleResponse> cycles = examGuideService.listCyclesForExam(TEST_EXAM_CODE);
        RecruitmentCycleResponse created = cycles.stream()
                .filter(c -> c.id().equals(response.appliedRecruitmentCycleId()))
                .findFirst().orElseThrow();
        assertThat(created.applicationStart()).isEqualTo(LocalDate.of(2026, 6, 9));
        assertThat(created.applicationEnd()).isEqualTo(LocalDate.of(2026, 7, 4));
    }

    @Test
    void accept_eligibilityRule_withRealCycleId_attachesToExistingCycle() {
        IngestionExtractionResult cycleCandidate = createPendingCandidate(ExtractionTargetType.RECRUITMENT_CYCLE_CORE,
                Map.of("cycleName", "ReviewQueueServiceTest eligibility fixture " + UUID.randomUUID()));
        IngestionExtractionResultResponse cycleResult = reviewQueueService.accept(
                cycleCandidate.getId(), Map.of("examCode", TEST_EXAM_CODE, "status", "NOTIFICATION_RELEASED"), null);
        UUID cycleId = cycleResult.appliedRecruitmentCycleId();
        createdCycleIds.add(cycleId);

        IngestionExtractionResult eligibilityCandidate = createPendingCandidate(ExtractionTargetType.ELIGIBILITY_RULE,
                Map.of("minimumAge", 18, "maximumAge", 32, "qualification", "Bachelor's Degree"));

        IngestionExtractionResultResponse response = reviewQueueService.accept(eligibilityCandidate.getId(), null, cycleId);

        assertThat(response.reviewStatus()).isEqualTo("ACCEPTED");
        assertThat(response.appliedRecruitmentCycleId()).isEqualTo(cycleId);

        EligibilityRuleResponse eligibility = examGuideService.getEligibility(cycleId).orElseThrow();
        assertThat(eligibility.minimumAge()).isEqualTo(18);
        assertThat(eligibility.maximumAge()).isEqualTo(32);
    }

    @Test
    void accept_nonCycleCoreCandidate_withoutRecruitmentCycleId_fails() {
        IngestionExtractionResult candidate = createPendingCandidate(ExtractionTargetType.ELIGIBILITY_RULE,
                Map.of("minimumAge", 18, "maximumAge", 32));

        assertThatThrownBy(() -> reviewQueueService.accept(candidate.getId(), null, null))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("recruitmentCycleId");
    }

    @Test
    void accept_alreadyReviewedCandidate_fails() {
        IngestionExtractionResult candidate = createPendingCandidate(ExtractionTargetType.RECRUITMENT_CYCLE_CORE,
                Map.of("cycleName", "ReviewQueueServiceTest double-accept fixture " + UUID.randomUUID()));
        IngestionExtractionResultResponse first = reviewQueueService.accept(
                candidate.getId(), Map.of("examCode", TEST_EXAM_CODE, "status", "NOTIFICATION_RELEASED"), null);
        createdCycleIds.add(first.appliedRecruitmentCycleId());

        assertThatThrownBy(() -> reviewQueueService.accept(candidate.getId(), Map.of("examCode", TEST_EXAM_CODE, "status", "NOTIFICATION_RELEASED"), null))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("already been reviewed");
    }

    @Test
    void reject_setsReasonAndStatus() {
        IngestionExtractionResult candidate = createPendingCandidate(ExtractionTargetType.FEE_RULE,
                Map.of("category", "General", "amountRupees", 100));

        IngestionExtractionResultResponse response = reviewQueueService.reject(candidate.getId(), "Fee amount looks wrong for this exam");

        assertThat(response.reviewStatus()).isEqualTo("REJECTED");
        assertThat(response.rejectionReason()).isEqualTo("Fee amount looks wrong for this exam");
    }

    // -------------------------------------------------------------- HTTP-layer coverage
    // Everything above calls ReviewQueueService directly, the same as testing its logic
    // in isolation -- these confirm the actual /api/admin/ingestion/review-queue/*
    // controller endpoints (auth, path/query binding, JSON (de)serialization) work too,
    // matching the HTTP-level coverage IngestionSourceTest/NoticeDiscoveryTest already
    // have for the rest of this controller.

    @Test
    void httpAccept_realEndpoint_appliesAndReturnsTheUpdatedCandidate() {
        IngestionExtractionResult candidate = createPendingCandidate(ExtractionTargetType.RECRUITMENT_CYCLE_CORE,
                Map.of("cycleName", "ReviewQueueServiceTest http-accept fixture " + UUID.randomUUID()));

        Map<String, Object> body = Map.of(
                "overrides", Map.of("examCode", TEST_EXAM_CODE, "status", "NOTIFICATION_RELEASED"));
        ResponseEntity<IngestionExtractionResultResponse> response = restTemplate.exchange(
                "/api/admin/ingestion/review-queue/" + candidate.getId() + "/accept",
                HttpMethod.POST, adminAuth(body), IngestionExtractionResultResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().reviewStatus()).isEqualTo("ACCEPTED");
        assertThat(response.getBody().appliedRecruitmentCycleId()).isNotNull();
        createdCycleIds.add(response.getBody().appliedRecruitmentCycleId());
    }

    @Test
    void httpGet_realEndpoint_returnsCandidateDetail() {
        IngestionExtractionResult candidate = createPendingCandidate(ExtractionTargetType.FEE_RULE,
                Map.of("category", "General", "amountRupees", 100));

        ResponseEntity<IngestionExtractionResultResponse> response = restTemplate.exchange(
                "/api/admin/ingestion/review-queue/" + candidate.getId(),
                HttpMethod.GET, adminAuth(), IngestionExtractionResultResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().id()).isEqualTo(candidate.getId());
        assertThat(response.getBody().reviewStatus()).isEqualTo("PENDING");
    }

    @Test
    void httpReject_realEndpoint_requiresANonBlankReason() {
        IngestionExtractionResult candidate = createPendingCandidate(ExtractionTargetType.FEE_RULE,
                Map.of("category", "General", "amountRupees", 100));

        ResponseEntity<Map> badResponse = restTemplate.exchange(
                "/api/admin/ingestion/review-queue/" + candidate.getId() + "/reject",
                HttpMethod.POST, adminAuth(Map.of("reason", "")), Map.class);
        assertThat(badResponse.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        ResponseEntity<IngestionExtractionResultResponse> okResponse = restTemplate.exchange(
                "/api/admin/ingestion/review-queue/" + candidate.getId() + "/reject",
                HttpMethod.POST, adminAuth(Map.of("reason", "Wrong fee amount")),
                IngestionExtractionResultResponse.class);
        assertThat(okResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(okResponse.getBody().reviewStatus()).isEqualTo("REJECTED");
    }
}
