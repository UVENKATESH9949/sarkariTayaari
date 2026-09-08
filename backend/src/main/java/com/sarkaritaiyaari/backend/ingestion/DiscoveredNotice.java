package com.sarkaritaiyaari.backend.ingestion;

import java.time.OffsetDateTime;
import java.util.List;

/**
 * TASK-2401 Document 3 -- what a {@link NoticeSourceAdapter} returns for one notice it
 * found. {@code externalRef} is null for a source with no stable id of its own (not the
 * case for SSC -- see {@link SscNoticeBoardApiAdapter}); {@code attachmentUrls} is
 * unused until Task 4 wires up document fetching.
 */
public record DiscoveredNotice(
        String externalRef,
        String title,
        String noticeUrl,
        OffsetDateTime publishedAt,
        List<String> attachmentUrls) {
}
