package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.entity.IngestionDocument;
import com.sarkaritaiyaari.backend.entity.IngestionNotice;
import com.sarkaritaiyaari.backend.entity.IngestionSource;
import com.sarkaritaiyaari.backend.entity.IngestionSourceType;
import com.sarkaritaiyaari.backend.repository.IngestionDocumentRepository;
import com.sarkaritaiyaari.backend.repository.IngestionNoticeRepository;
import com.sarkaritaiyaari.backend.repository.IngestionSourceRepository;
import com.sarkaritaiyaari.backend.service.DocumentStoreService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

import java.nio.charset.StandardCharsets;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * TASK-2401 Task 4 -- the real sha256 dedup/supersede logic, tested with in-memory byte
 * arrays and {@link com.sarkaritaiyaari.backend.ingestion.FakeDocumentStorage} (never a
 * real Cloudinary call -- see that fixture's own doc comment). Only
 * {@link DocumentStoreService#store} is exercised here; the network-fetching half
 * ({@code fetchAndStore}/{@code DocumentFetcher}) was instead verified once, deliberately,
 * by a manual one-off run against the real live SSC site (see this task's own report --
 * not repeated here as an automated test, matching this project's stance against
 * hammering a live external site on every test run).
 */
class DocumentStoreServiceTest extends AbstractIntegrationTest {

    @Autowired
    private DocumentStoreService documentStoreService;

    @Autowired
    private IngestionDocumentRepository documentRepository;

    @Autowired
    private IngestionNoticeRepository ingestionNoticeRepository;

    @Autowired
    private IngestionSourceRepository ingestionSourceRepository;

    private final List<UUID> createdSourceIds = new ArrayList<>();

    @AfterEach
    void cleanup() {
        if (!createdSourceIds.isEmpty()) {
            // ingestion_documents sets notice_id to null on delete (V32) rather than
            // cascading, so its fixture rows need deleting explicitly before the source
            // (and the notices that cascade from it, V31) can go. Queried by id rather
            // than traversing document.getNotice().getSource() -- both are LAZY relations
            // and open-in-view is off, so that traversal would throw outside a transaction.
            List<UUID> noticeIds = createdSourceIds.stream()
                    .flatMap(sourceId -> ingestionNoticeRepository.findBySource_Id(sourceId).stream())
                    .map(IngestionNotice::getId)
                    .toList();
            if (!noticeIds.isEmpty()) {
                documentRepository.deleteAll(documentRepository.findByNotice_IdIn(noticeIds));
            }
            ingestionSourceRepository.deleteAllById(createdSourceIds);
            createdSourceIds.clear();
        }
    }

    private IngestionNotice createNotice() {
        IngestionSource source = new IngestionSource();
        source.setOrganization("Test Org");
        source.setName("DocumentStoreServiceTest fixture " + UUID.randomUUID());
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

    private static byte[] pdfBytes(String marker) {
        return ("%PDF-1.4\n% fixture content: " + marker).getBytes(StandardCharsets.UTF_8);
    }

    @Test
    void store_createsANewDocumentWithTheStorageUrl() {
        IngestionNotice notice = createNotice();
        IngestionDocument document = documentStoreService.store("https://example.invalid/a.pdf", notice, pdfBytes("A"));

        assertThat(document.getId()).isNotNull();
        assertThat(document.getStorageUrl()).startsWith("https://fake-storage.invalid/");
        assertThat(document.getMimeType()).isEqualTo("application/pdf");
        assertThat(document.getSupersedesDocument()).isNull();
    }

    @Test
    void store_sameBytesTwice_dedupsRatherThanCreatingASecondRow() {
        IngestionNotice notice = createNotice();
        byte[] bytes = pdfBytes("DEDUP-CHECK");

        IngestionDocument first = documentStoreService.store("https://example.invalid/a.pdf", notice, bytes);
        IngestionDocument second = documentStoreService.store("https://example.invalid/a-mirror.pdf", notice, bytes);

        assertThat(second.getId()).isEqualTo(first.getId());
        assertThat(documentRepository.findBySha256Hash(first.getSha256Hash())).isPresent();
    }

    @Test
    void store_differentBytesForSameNotice_chainsViaSupersedes() {
        IngestionNotice notice = createNotice();
        IngestionDocument original = documentStoreService.store("https://example.invalid/a.pdf", notice, pdfBytes("V1"));
        IngestionDocument corrigendum = documentStoreService.store("https://example.invalid/a.pdf", notice, pdfBytes("V2"));

        assertThat(corrigendum.getId()).isNotEqualTo(original.getId());
        assertThat(corrigendum.getSupersedesDocument().getId()).isEqualTo(original.getId());
        // The original row must still exist, untouched -- never overwritten.
        assertThat(documentRepository.findById(original.getId())).isPresent();
    }

    @Test
    void store_rejectsBytesThatAreNotAPdf() {
        IngestionNotice notice = createNotice();
        byte[] notAPdf = "this is definitely not a pdf".getBytes(StandardCharsets.UTF_8);

        assertThatThrownBy(() -> documentStoreService.store("https://example.invalid/fake.pdf", notice, notAPdf))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Not a valid PDF");
    }
}
