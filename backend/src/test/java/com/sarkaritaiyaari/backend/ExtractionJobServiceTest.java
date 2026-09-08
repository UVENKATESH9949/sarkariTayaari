package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.entity.ExtractionJobStatus;
import com.sarkaritaiyaari.backend.entity.ExtractionReviewStatus;
import com.sarkaritaiyaari.backend.entity.ExtractionTargetType;
import com.sarkaritaiyaari.backend.entity.IngestionDocument;
import com.sarkaritaiyaari.backend.entity.IngestionExtractionJob;
import com.sarkaritaiyaari.backend.entity.IngestionExtractionResult;
import com.sarkaritaiyaari.backend.entity.IngestionNotice;
import com.sarkaritaiyaari.backend.entity.IngestionSource;
import com.sarkaritaiyaari.backend.entity.IngestionSourceType;
import com.sarkaritaiyaari.backend.ingestion.DetectedSection;
import com.sarkaritaiyaari.backend.repository.IngestionDocumentRepository;
import com.sarkaritaiyaari.backend.repository.IngestionExtractionJobRepository;
import com.sarkaritaiyaari.backend.repository.IngestionExtractionResultRepository;
import com.sarkaritaiyaari.backend.repository.IngestionNoticeRepository;
import com.sarkaritaiyaari.backend.repository.IngestionSourceRepository;
import com.sarkaritaiyaari.backend.service.DocumentStoreService;
import com.sarkaritaiyaari.backend.service.ExtractionJobService;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TASK-2401 Task 5 -- the real integration between {@link DocumentStoreService} and
 * {@link ExtractionJobService}: a stored document actually gets its page count/
 * text-extractable flag populated and a job row created, using a synthetic PDFBox-built
 * fixture (real database, no real network -- {@code PdfTextExtractorTest} already covers
 * the pure extraction logic on its own).
 */
class ExtractionJobServiceTest extends AbstractIntegrationTest {

    @Autowired
    private DocumentStoreService documentStoreService;

    @Autowired
    private ExtractionJobService extractionJobService;

    @Autowired
    private IngestionExtractionJobRepository jobRepository;

    @Autowired
    private IngestionDocumentRepository documentRepository;

    @Autowired
    private IngestionExtractionResultRepository extractionResultRepository;

    @Autowired
    private IngestionNoticeRepository ingestionNoticeRepository;

    @Autowired
    private IngestionSourceRepository ingestionSourceRepository;

    private final List<UUID> createdSourceIds = new ArrayList<>();

    @AfterEach
    void cleanup() {
        if (!createdSourceIds.isEmpty()) {
            List<UUID> noticeIds = createdSourceIds.stream()
                    .flatMap(sourceId -> ingestionNoticeRepository.findBySource_Id(sourceId).stream())
                    .map(IngestionNotice::getId)
                    .toList();
            if (!noticeIds.isEmpty()) {
                List<IngestionDocument> docs = documentRepository.findByNotice_IdIn(noticeIds);
                for (IngestionDocument doc : docs) {
                    jobRepository.deleteAll(jobRepository.findByDocument_Id(doc.getId()));
                }
                documentRepository.deleteAll(docs);
            }
            ingestionSourceRepository.deleteAllById(createdSourceIds);
            createdSourceIds.clear();
        }
    }

    private IngestionNotice createNotice() {
        IngestionSource source = new IngestionSource();
        source.setOrganization("Test Org");
        source.setName("ExtractionJobServiceTest fixture " + UUID.randomUUID());
        source.setBaseUrl("https://example.invalid");
        source.setSourceType(IngestionSourceType.API);
        source.setParserKey("unused_in_this_test");
        source.setActive(true);
        source.setCheckFrequencyMinutes(1440);
        OffsetDateTime now = OffsetDateTime.now();
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
        return ingestionNoticeRepository.save(notice);
    }

    private static byte[] syntheticPdf(String text) throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage();
            document.addPage(page);
            try (PDPageContentStream stream = new PDPageContentStream(document, page)) {
                stream.beginText();
                stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                stream.newLineAtOffset(50, 700);
                stream.showText(text);
                stream.endText();
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }

    @Test
    void processDocument_populatesPageCountAndExtractableFlagAndCreatesASucceededJob() throws IOException {
        IngestionNotice notice = createNotice();
        byte[] pdfBytes = syntheticPdf("IMPORTANT DATES This is a real enough line of text for the extractable threshold.");

        IngestionDocument document = documentStoreService.store("https://example.invalid/a.pdf", notice, pdfBytes);
        List<DetectedSection> sections = extractionJobService.processDocument(document, pdfBytes);

        IngestionDocument reloaded = documentRepository.findById(document.getId()).orElseThrow();
        assertThat(reloaded.getPageCount()).isEqualTo(1);
        assertThat(reloaded.getIsTextExtractable()).isTrue();

        List<IngestionExtractionJob> jobs = jobRepository.findByDocument_Id(document.getId());
        assertThat(jobs).hasSize(1);
        assertThat(jobs.get(0).getStatus()).isEqualTo(ExtractionJobStatus.SUCCEEDED);
        assertThat(jobs.get(0).getFinishedAt()).isNotNull();

        assertThat(sections).isNotEmpty();
    }

    private static byte[] syntheticPdfMultiLine(List<String> lines) throws IOException {
        try (PDDocument document = new PDDocument()) {
            PDPage page = new PDPage();
            document.addPage(page);
            try (PDPageContentStream stream = new PDPageContentStream(document, page)) {
                stream.setFont(new PDType1Font(Standard14Fonts.FontName.HELVETICA), 12);
                stream.beginText();
                stream.newLineAtOffset(50, 700);
                for (String line : lines) {
                    stream.showText(line);
                    stream.newLineAtOffset(0, -15);
                }
                stream.endText();
            }
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }

    @Test
    void processDocument_realisticNotice_createsExtractionResultsForKnownFields() throws IOException {
        IngestionNotice notice = createNotice();
        byte[] pdfBytes = syntheticPdfMultiLine(List.of(
                "IMPORTANT DATES",
                "Commencement of Online Application: 09-06-2026",
                "Last date for submission of online application: 04-07-2026",
                "VACANCY",
                "Total No. of Vacancies : 14582"));

        IngestionDocument document = documentStoreService.store("https://example.invalid/a.pdf", notice, pdfBytes);
        extractionJobService.processDocument(document, pdfBytes);

        List<IngestionExtractionJob> jobs = jobRepository.findByDocument_Id(document.getId());
        assertThat(jobs).hasSize(1);
        assertThat(jobs.get(0).getFieldsExtractedCount()).isGreaterThan(0);

        List<IngestionExtractionResult> results = extractionResultRepository.findByExtractionJob_Id(jobs.get(0).getId());
        assertThat(results).hasSize(1);
        IngestionExtractionResult cycleCore = results.get(0);
        assertThat(cycleCore.getTargetType()).isEqualTo(ExtractionTargetType.RECRUITMENT_CYCLE_CORE);
        assertThat(cycleCore.getPayload()).containsEntry("applicationStart", "2026-06-09");
        assertThat(cycleCore.getPayload()).containsEntry("applicationEnd", "2026-07-04");
        assertThat(((Number) cycleCore.getPayload().get("vacancyCount")).intValue()).isEqualTo(14582);
        assertThat(cycleCore.getReviewStatus()).isEqualTo(ExtractionReviewStatus.PENDING);
        assertThat(cycleCore.getValidationWarnings()).isNull();
    }

    @Test
    void processDocument_invertedDates_persistsARealValidationWarning() throws IOException {
        IngestionNotice notice = createNotice();
        // Application "end" deliberately earlier than "start" -- Task 7's ValidationEngine
        // should flag this on the persisted candidate row itself, advisory only (the row
        // still gets created, per Document 8's "advisory, not blocking" design).
        byte[] pdfBytes = syntheticPdfMultiLine(List.of(
                "IMPORTANT DATES",
                "Commencement of Online Application: 04-07-2026",
                "Last date for submission of online application: 09-06-2026"));

        IngestionDocument document = documentStoreService.store("https://example.invalid/a.pdf", notice, pdfBytes);
        extractionJobService.processDocument(document, pdfBytes);

        List<IngestionExtractionJob> jobs = jobRepository.findByDocument_Id(document.getId());
        List<IngestionExtractionResult> results = extractionResultRepository.findByExtractionJob_Id(jobs.get(0).getId());
        IngestionExtractionResult cycleCore = results.get(0);

        assertThat(cycleCore.getValidationWarnings()).isNotNull();
        @SuppressWarnings("unchecked")
        List<String> messages = (List<String>) cycleCore.getValidationWarnings().get("messages");
        assertThat(messages).anyMatch(m -> m.contains("applicationStart") && m.contains("after"));
    }

    @Test
    void processDocument_calledTwice_isIdempotent() throws IOException {
        IngestionNotice notice = createNotice();
        byte[] pdfBytes = syntheticPdf("A perfectly ordinary fixture notice with real extractable text content.");

        IngestionDocument document = documentStoreService.store("https://example.invalid/a.pdf", notice, pdfBytes);
        extractionJobService.processDocument(document, pdfBytes);
        List<DetectedSection> second = extractionJobService.processDocument(document, pdfBytes);

        assertThat(jobRepository.findByDocument_Id(document.getId())).hasSize(1);
        assertThat(second).isEmpty();
    }
}
