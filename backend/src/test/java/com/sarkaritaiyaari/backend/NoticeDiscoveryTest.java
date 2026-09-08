package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.IngestionAdminDtos.IngestionNoticeResponse;
import com.sarkaritaiyaari.backend.dto.IngestionAdminDtos.IngestionSourceRequest;
import com.sarkaritaiyaari.backend.dto.IngestionAdminDtos.IngestionSourceResponse;
import com.sarkaritaiyaari.backend.dto.IngestionAdminDtos.ScanResult;
import com.sarkaritaiyaari.backend.ingestion.DiscoveredNotice;
import com.sarkaritaiyaari.backend.ingestion.FixtureNoticeSourceAdapter;
import com.sarkaritaiyaari.backend.repository.IngestionNoticeRepository;
import com.sarkaritaiyaari.backend.repository.IngestionSourceRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TASK-2401 Task 3 -- exercises the real NoticeDiscoveryService diffing logic (NEW /
 * UPDATED / UNCHANGED / REMOVED) end to end through the real HTTP endpoints, via a fake
 * {@link FixtureNoticeSourceAdapter} rather than the real SSC site. Deliberately never
 * calls the live ssc.gov.in API from an automated test -- see
 * SscNoticeBoardApiAdapter's own class doc on rate limits never being stress-tested;
 * repeatedly hitting a live government site on every test run would be exactly that.
 */
class NoticeDiscoveryTest extends AbstractIntegrationTest {

    @Autowired
    private IngestionSourceRepository ingestionSourceRepository;

    @Autowired
    private IngestionNoticeRepository ingestionNoticeRepository;

    private final List<UUID> createdSourceIds = new ArrayList<>();

    @AfterEach
    void cleanup() {
        if (!createdSourceIds.isEmpty()) {
            // ingestion_notices FKs cascade on delete (see V31), so deleting the source is enough.
            ingestionSourceRepository.deleteAllById(createdSourceIds);
            createdSourceIds.clear();
        }
    }

    private UUID createFixtureSource() {
        IngestionSourceRequest request = new IngestionSourceRequest(
                "Test Organization", "NoticeDiscoveryTest fixture source " + UUID.randomUUID(),
                "https://example.invalid", "API", "test_fixture_adapter_v1", null, true, 1440);
        ResponseEntity<IngestionSourceResponse> response = restTemplate.exchange(
                "/api/admin/ingestion/sources", HttpMethod.POST, adminAuth(request), IngestionSourceResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        UUID id = response.getBody().id();
        createdSourceIds.add(id);
        return id;
    }

    private ScanResult scan(UUID sourceId) {
        ResponseEntity<ScanResult> response = restTemplate.exchange(
                "/api/admin/ingestion/sources/" + sourceId + "/scan", HttpMethod.POST, adminAuth(), ScanResult.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody();
    }

    private List<IngestionNoticeResponse> listNotices(UUID sourceId, String status) {
        ResponseEntity<IngestionNoticeResponse[]> response = restTemplate.exchange(
                "/api/admin/ingestion/sources/" + sourceId + "/notices?status=" + status,
                HttpMethod.GET, adminAuth(), IngestionNoticeResponse[].class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return List.of(response.getBody());
    }

    @Test
    void firstScan_createsOneNoticePerDiscoveredItem() {
        UUID sourceId = createFixtureSource();
        FixtureNoticeSourceAdapter.enqueue(List.of(
                new DiscoveredNotice("ext-a", "Notice A", null, OffsetDateTime.now(), List.of()),
                new DiscoveredNotice("ext-b", "Notice B", null, OffsetDateTime.now(), List.of())));

        ScanResult result = scan(sourceId);

        assertThat(result.discovered()).isEqualTo(2);
        assertThat(result.created()).isEqualTo(2);
        assertThat(result.updated()).isZero();
        assertThat(result.unchanged()).isZero();
        assertThat(result.removed()).isZero();

        List<IngestionNoticeResponse> active = listNotices(sourceId, "ACTIVE");
        assertThat(active).extracting(IngestionNoticeResponse::externalRef).containsExactlyInAnyOrder("ext-a", "ext-b");
        assertThat(active).allMatch(n -> n.removedAt() == null);
    }

    @Test
    void secondScan_detectsUpdatedUnchangedNewAndRemoved() {
        UUID sourceId = createFixtureSource();
        OffsetDateTime t0 = OffsetDateTime.now();
        FixtureNoticeSourceAdapter.enqueue(List.of(
                new DiscoveredNotice("ext-a", "Notice A", null, t0, List.of()),
                new DiscoveredNotice("ext-b", "Notice B", null, t0, List.of())));
        scan(sourceId);

        // Second scan: A's title changes (UPDATED), B disappears (REMOVED), C is new (CREATED).
        FixtureNoticeSourceAdapter.enqueue(List.of(
                new DiscoveredNotice("ext-a", "Notice A -- Corrigendum", null, t0, List.of()),
                new DiscoveredNotice("ext-c", "Notice C", null, t0, List.of())));

        ScanResult result = scan(sourceId);

        assertThat(result.discovered()).isEqualTo(2);
        assertThat(result.created()).isEqualTo(1);
        assertThat(result.updated()).isEqualTo(1);
        assertThat(result.unchanged()).isZero();
        assertThat(result.removed()).isEqualTo(1);

        List<IngestionNoticeResponse> active = listNotices(sourceId, "ACTIVE");
        assertThat(active).extracting(IngestionNoticeResponse::externalRef).containsExactlyInAnyOrder("ext-a", "ext-c");
        assertThat(active).filteredOn(n -> "ext-a".equals(n.externalRef())).extracting(IngestionNoticeResponse::title)
                .containsExactly("Notice A -- Corrigendum");

        List<IngestionNoticeResponse> removed = listNotices(sourceId, "REMOVED");
        assertThat(removed).extracting(IngestionNoticeResponse::externalRef).containsExactly("ext-b");
        assertThat(removed).allMatch(n -> n.removedAt() != null);
    }

    @Test
    void thirdScan_withNoContentChange_isUnchanged() {
        UUID sourceId = createFixtureSource();
        OffsetDateTime t0 = OffsetDateTime.now();
        FixtureNoticeSourceAdapter.enqueue(List.of(new DiscoveredNotice("ext-a", "Notice A", null, t0, List.of())));
        scan(sourceId);

        FixtureNoticeSourceAdapter.enqueue(List.of(new DiscoveredNotice("ext-a", "Notice A", null, t0, List.of())));
        ScanResult result = scan(sourceId);

        assertThat(result.created()).isZero();
        assertThat(result.updated()).isZero();
        assertThat(result.unchanged()).isEqualTo(1);
        assertThat(result.removed()).isZero();
    }

    @Test
    void scan_updatesSourceHealthFields() {
        UUID sourceId = createFixtureSource();
        FixtureNoticeSourceAdapter.enqueue(List.of());
        scan(sourceId);

        List<IngestionSourceResponse> sources = List.of(restTemplate.exchange(
                "/api/admin/ingestion/sources", HttpMethod.GET, adminAuth(), IngestionSourceResponse[].class).getBody());
        IngestionSourceResponse source = sources.stream().filter(s -> s.id().equals(sourceId)).findFirst().orElseThrow();

        assertThat(source.lastCheckedAt()).isNotNull();
        assertThat(source.lastSuccessAt()).isNotNull();
        assertThat(source.consecutiveFailures()).isZero();
    }

    @Test
    void scan_unknownParserKey_fails() {
        IngestionSourceRequest request = new IngestionSourceRequest(
                "Test Organization", "NoticeDiscoveryTest bad parser key " + UUID.randomUUID(),
                "https://example.invalid", "API", "no_such_adapter_registered", null, true, 1440);
        ResponseEntity<IngestionSourceResponse> created = restTemplate.exchange(
                "/api/admin/ingestion/sources", HttpMethod.POST, adminAuth(request), IngestionSourceResponse.class);
        UUID sourceId = created.getBody().id();
        createdSourceIds.add(sourceId);

        ResponseEntity<Map> response = restTemplate.exchange(
                "/api/admin/ingestion/sources/" + sourceId + "/scan", HttpMethod.POST, adminAuth(), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.INTERNAL_SERVER_ERROR);
    }

    /** TASK-2401 Document 15's reliability table: a document fetch failure must never fail
     * the notice's own discovery or the rest of the scan. Uses a private-IP attachment URL
     * so {@code OutboundUrlGuard} rejects it instantly -- deterministic, no real network
     * call, and exercises the exact resilience path Task 4 added to {@code scan()}. */
    @Test
    void documentFetchFailure_doesNotFailTheNoticeOrTheScan() {
        UUID sourceId = createFixtureSource();
        FixtureNoticeSourceAdapter.enqueue(List.of(
                new DiscoveredNotice("ext-a", "Notice with an unfetchable attachment", null, OffsetDateTime.now(),
                        List.of("http://127.0.0.1/unreachable.pdf"))));

        ScanResult result = scan(sourceId);

        assertThat(result.created()).isEqualTo(1);
        List<IngestionNoticeResponse> active = listNotices(sourceId, "ACTIVE");
        assertThat(active).hasSize(1);
        assertThat(active.get(0).documentUrl()).isNull();
    }
}
