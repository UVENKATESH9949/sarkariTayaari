package com.sarkaritaiyaari.backend.ingestion;

import com.sarkaritaiyaari.backend.entity.IngestionSource;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * TASK-2401 Task 3 test fixture -- a fake {@link NoticeSourceAdapter} so
 * {@code NoticeDiscoveryTest} can exercise the real NEW/UPDATED/UNCHANGED/REMOVED diffing
 * logic without ever making a real network call. Never registered outside the test
 * classpath (test-source components aren't packaged into the production jar), same as
 * {@code AdminTokenMintRunner}'s own harmless-fixture precedent.
 *
 * <p>Not thread-safe by design -- this project's test suite runs sequentially, and a
 * plain static field is simpler than getting a {@code ThreadLocal} wrong across the
 * embedded Tomcat request thread vs. the test thread.
 */
@Component("test_fixture_adapter_v1")
public class FixtureNoticeSourceAdapter implements NoticeSourceAdapter {

    private static volatile List<DiscoveredNotice> queued = List.of();

    public static void enqueue(List<DiscoveredNotice> notices) {
        queued = notices;
    }

    @Override
    public List<DiscoveredNotice> listNotices(IngestionSource source) {
        return queued;
    }
}
