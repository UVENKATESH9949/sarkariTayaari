package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.QuestionIngestionDtos.IngestSummary;
import com.sarkaritaiyaari.backend.dto.QuestionIngestionDtos.QuestionCandidateResponse;
import com.sarkaritaiyaari.backend.entity.ExtractionReviewStatus;
import com.sarkaritaiyaari.backend.repository.IngestionDocumentRepository;
import com.sarkaritaiyaari.backend.service.QuestionIngestionService;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TASK-2501 Phase 2 -- the rule-based question-ingestion pipeline: PDF -> raw extractions ->
 * candidates -> Accept/Reject -> a real {@code questions} row gated by content_status.
 *
 * <p>{@link QuestionIngestionService#ingest} does a real, SSRF-guarded network fetch, which
 * (per {@code DocumentStoreServiceTest}'s own established precedent for this exact tension)
 * this automated test does not exercise — a synthetic PDF is stored directly via {@link
 * QuestionIngestionService#ingestBytes}, testing everything downstream of fetch: store,
 * extract, split, stage, validate, duplicate-check, Accept, content-status gating.
 */
class QuestionIngestionTest extends AbstractIntegrationTest {

    private static final String MARKER = "TASK2501INGESTIONTEST";

    @Autowired
    private QuestionIngestionService ingestionService;

    @Autowired
    private IngestionDocumentRepository ingestionDocumentRepository;

    private UUID documentId;

    @AfterEach
    void cleanupIngestionRows() {
        // Runs before AbstractIntegrationTest's own cleanup() (JUnit tears down subclass
        // @AfterEach before superclass) -- load-bearing, not incidental: deleting the
        // document cascades away every question_candidates row (including one whose
        // applied_question_id points at a fixture question createdIds is about to hard-delete),
        // so nothing is left referencing a question row that's about to disappear.
        if (documentId != null) {
            ingestionDocumentRepository.deleteById(documentId);
            documentId = null;
        }
    }

    private static byte[] fixturePdf() throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage();
            document.addPage(page);
            List<String> lines = List.of(
                    "1. " + MARKER + " sample question about numbers, what is 2 add 2?",
                    "(A) 3",
                    "(B) 4",
                    "(C) 5",
                    "(D) 6",
                    "Answer: B",
                    "2. " + MARKER + " sample question about planets, which one is called red?",
                    "(A) Venus",
                    "(B) Mars",
                    "(C) Jupiter",
                    "(D) Saturn",
                    "Answer: B",
                    "3. " + MARKER + " garbled block with no options at all, just plain prose text here.",
                    "4. " + MARKER + " sample question about capitals, which one is in Europe?",
                    "(A) Berlin",
                    "(B) Madrid",
                    "(C) Paris",
                    "(D) Rome");
            try (PDPageContentStream stream = new PDPageContentStream(document, page)) {
                stream.beginText();
                stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 10);
                stream.newLineAtOffset(50, 750);
                for (int i = 0; i < lines.size(); i++) {
                    if (i > 0) {
                        stream.newLineAtOffset(0, -14);
                    }
                    stream.showText(lines.get(i));
                }
                stream.endText();
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }

    @Test
    void ingest_splitsIntoCandidatesWithExpectedConfidence() throws IOException {
        IngestSummary summary = ingestionService.ingestBytes(
                "https://example.invalid/" + UUID.randomUUID() + ".pdf", fixturePdf());
        documentId = summary.documentId();

        assertThat(summary.extracted()).isEqualTo(4);
        // Q1 and Q2: 4 options + a resolved answer -> HIGH, no warnings, no duplicate -> auto-acceptable.
        assertThat(summary.autoAcceptable()).isEqualTo(2);
        // Q3 (no options at all) and Q4 (4 options, no answer) both need a look.
        assertThat(summary.needsReview()).isEqualTo(2);
        assertThat(summary.possibleDuplicates()).isZero();

        ResponseEntity<QuestionCandidateResponse[]> listResponse = restTemplate.exchange(
                "/api/admin/question-ingestion/candidates?documentId=" + documentId,
                HttpMethod.GET, adminAuth(), QuestionCandidateResponse[].class);
        assertThat(listResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<QuestionCandidateResponse> candidates = List.of(listResponse.getBody());
        assertThat(candidates).hasSize(4);
        assertThat(candidates).extracting(QuestionCandidateResponse::confidence)
                .containsExactlyInAnyOrder("HIGH", "HIGH", "LOW", "MEDIUM");
        assertThat(candidates).allMatch(c -> "PENDING".equals(c.status()));
    }

    @Test
    void upload_ingestsAPdfFromMultipartFormData() throws IOException {
        byte[] pdfBytes = fixturePdf();
        ByteArrayResource fileResource = new ByteArrayResource(pdfBytes) {
            @Override
            public String getFilename() {
                return "ui-verify-sample.pdf";
            }
        };
        MultiValueMap<String, Object> body = new LinkedMultiValueMap<>();
        body.add("file", fileResource);

        ResponseEntity<IngestSummary> response = restTemplate.exchange(
                "/api/admin/question-ingestion/documents/upload", HttpMethod.POST,
                adminAuth(body), IngestSummary.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody().extracted()).isEqualTo(4);
        documentId = response.getBody().documentId();
    }

    @Test
    void accept_createsADraftQuestion_excludedFromPublicReadsUntilPublished() throws IOException {
        IngestSummary summary = ingestionService.ingestBytes(
                "https://example.invalid/" + UUID.randomUUID() + ".pdf", fixturePdf());
        documentId = summary.documentId();

        List<QuestionCandidateResponse> candidates = ingestionService.listCandidates(documentId, null);
        QuestionCandidateResponse highConfidence = candidates.stream()
                .filter(c -> "HIGH".equals(c.confidence()))
                .findFirst().orElseThrow();

        Map<String, Object> overrides = Map.of(
                "topicId", testTopicId.toString(),
                "examCodes", List.of(TEST_EXAM_CODE),
                "difficulty", "easy");

        ResponseEntity<QuestionCandidateResponse> acceptResponse = restTemplate.exchange(
                "/api/admin/question-ingestion/candidates/" + highConfidence.id() + "/accept",
                HttpMethod.POST, adminAuth(Map.of("overrides", overrides)), QuestionCandidateResponse.class);
        assertThat(acceptResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        UUID appliedQuestionId = acceptResponse.getBody().appliedQuestionId();
        assertThat(appliedQuestionId).isNotNull();
        createdIds.add(appliedQuestionId);

        ResponseEntity<Map> getResponse = restTemplate.exchange(
                "/api/questions/" + appliedQuestionId, HttpMethod.GET, adminAuth(), Map.class);
        assertThat(getResponse.getBody().get("contentStatus")).isEqualTo("DRAFT");
        List<?> occurrences = (List<?>) getResponse.getBody().get("occurrences");
        assertThat(occurrences).hasSize(1);

        // Excluded from /live while DRAFT.
        assertThat(fetchLiveIds()).doesNotContain(appliedQuestionId);
        // Excluded from a live-sampled Mock Test pull while DRAFT.
        assertThat(fetchMockSampleIds()).doesNotContain(appliedQuestionId);

        // Publish, then confirm it's now visible on both.
        restTemplate.exchange("/api/questions/" + appliedQuestionId + "/content-status",
                HttpMethod.PUT, adminAuth(Map.of("status", "PUBLISHED")), Void.class);

        assertThat(fetchLiveIds()).contains(appliedQuestionId);
        assertThat(fetchMockSampleIds()).contains(appliedQuestionId);

        // Re-accepting an already-reviewed candidate must not be possible.
        ResponseEntity<Map> secondAccept = restTemplate.exchange(
                "/api/admin/question-ingestion/candidates/" + highConfidence.id() + "/accept",
                HttpMethod.POST, adminAuth(Map.of("overrides", overrides)), Map.class);
        assertThat(secondAccept.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void reject_storesReasonAndCreatesNoQuestion() throws IOException {
        IngestSummary summary = ingestionService.ingestBytes(
                "https://example.invalid/" + UUID.randomUUID() + ".pdf", fixturePdf());
        documentId = summary.documentId();

        QuestionCandidateResponse candidate = ingestionService.listCandidates(documentId, null).get(0);

        ResponseEntity<QuestionCandidateResponse> rejectResponse = restTemplate.exchange(
                "/api/admin/question-ingestion/candidates/" + candidate.id() + "/reject",
                HttpMethod.POST, adminAuth(Map.of("reason", "Not usable")), QuestionCandidateResponse.class);

        assertThat(rejectResponse.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(rejectResponse.getBody().status()).isEqualTo("REJECTED");
        assertThat(rejectResponse.getBody().rejectionReason()).isEqualTo("Not usable");
        assertThat(rejectResponse.getBody().appliedQuestionId()).isNull();
    }

    @SuppressWarnings("unchecked")
    private List<UUID> fetchLiveIds() {
        ResponseEntity<Map> response = restTemplate.exchange(
                "/api/questions/live?examCode=" + TEST_EXAM_CODE + "&topicId=" + testTopicId + "&size=200",
                HttpMethod.GET, adminAuth(), Map.class);
        List<Map<String, Object>> content = (List<Map<String, Object>>) response.getBody().get("content");
        return content.stream().map(q -> UUID.fromString((String) q.get("id"))).toList();
    }

    @SuppressWarnings("unchecked")
    private List<UUID> fetchMockSampleIds() {
        ResponseEntity<List> response = restTemplate.exchange(
                "/api/questions/mock-sample?examCode=" + TEST_EXAM_CODE + "&subjectIds=" + testSubjectId() + "&limit=200",
                HttpMethod.GET, adminAuth(), List.class);
        List<Map<String, Object>> content = response.getBody();
        return content.stream().map(q -> UUID.fromString((String) q.get("id"))).toList();
    }

    @SuppressWarnings("unchecked")
    private UUID testSubjectId() {
        ResponseEntity<Map> topicResponse = restTemplate.exchange(
                "/api/topics/" + testTopicId, HttpMethod.GET, adminAuth(), Map.class);
        return UUID.fromString((String) topicResponse.getBody().get("subjectId"));
    }
}
