package com.sarkaritaiyaari.backend.ingestion;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sarkaritaiyaari.backend.entity.IngestionSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;

/**
 * TASK-2401 Document 4 (revised 2026-09-06, Task 1 investigation). SSC's notice board
 * page (ssc.gov.in/home/notice-board) is an Angular SPA with no server-rendered content
 * -- confirmed via raw curl -- but it calls a real, unauthenticated JSON API to populate
 * itself, confirmed via a headless-Playwright network capture against the live site.
 * This adapter calls that API directly rather than rendering the page, which is simpler,
 * faster, and doesn't need a browser runtime per scan.
 *
 * <p>Bean name is {@code "ssc_notice_board_v1"} -- the {@code parser_key} a real SSC
 * {@code ingestion_sources} row must use to resolve to this adapter (Document 3's
 * {@code Map<String, NoticeSourceAdapter>} resolution, no inheritance tree).
 *
 * <p>{@code robots.txt} was confirmed absent for this site (a real nginx 404, not a
 * soft-redirect) -- there is no published crawl restriction to violate. Rate limits were
 * deliberately never stress-tested against the live site, so this adapter still
 * self-imposes a conservative page cap and an honest identifying User-Agent rather than
 * relying on the site to enforce a limit of its own.
 */
@Component("ssc_notice_board_v1")
public class SscNoticeBoardApiAdapter implements NoticeSourceAdapter {

    private static final Logger log = LoggerFactory.getLogger(SscNoticeBoardApiAdapter.class);

    private static final String USER_AGENT =
            "SarkariTaiyaariIngestionBot/1.0 (+https://sarkaritaiyaari.app; admin@sarkaritaiyaari.app)";
    private static final int DEFAULT_LIMIT = 50;
    private static final int DEFAULT_MAX_PAGES = 5;

    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public List<DiscoveredNotice> listNotices(IngestionSource source) {
        int limit = configInt(source, "limit", DEFAULT_LIMIT);
        int maxPages = configInt(source, "maxPages", DEFAULT_MAX_PAGES);

        List<DiscoveredNotice> notices = new ArrayList<>();
        for (int page = 1; page <= maxPages; page++) {
            String url = source.getBaseUrl()
                    + "/api/general-website/portal/records"
                    + "?page=" + page + "&limit=" + limit
                    + "&contentType=notice-boards&key=createdAt&order=DESC&pageType=filter"
                    + "&isAttachment=true&attributes=id,headline,examId,contentType,redirectUrl,startDate,endDate,language,createdAt"
                    + "&exams=false&date=false&language=english";
            OutboundUrlGuard.requireSafe(url);

            JsonNode body = fetch(url);
            JsonNode data = body.path("data");
            if (!data.isArray() || data.isEmpty()) {
                break;
            }
            for (JsonNode item : data) {
                notices.add(toNotice(source, item));
            }
            if (data.size() < limit) {
                break; // short page -- nothing more to fetch
            }
        }
        log.info("SSC notice board scan: {} notice(s) discovered", notices.size());
        return notices;
    }

    private JsonNode fetch(String url) {
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(20))
                    .header("Accept", "application/json")
                    .header("User-Agent", USER_AGENT)
                    .GET()
                    .build();
            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                throw new IllegalStateException("SSC notice board API returned HTTP " + response.statusCode());
            }
            return objectMapper.readTree(response.body());
        } catch (IOException e) {
            throw new IllegalStateException("Failed to fetch SSC notice board: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while fetching SSC notice board", e);
        }
    }

    private DiscoveredNotice toNotice(IngestionSource source, JsonNode item) {
        String externalRef = item.path("id").asText(null);
        String title = item.path("headline").asText("").strip();

        String noticeUrl = item.path("redirectUrl").asText(null);
        if (noticeUrl != null && noticeUrl.isBlank()) {
            noticeUrl = null;
        }

        OffsetDateTime publishedAt = null;
        String createdAt = item.path("createdAt").asText(null);
        if (createdAt != null) {
            try {
                publishedAt = OffsetDateTime.parse(createdAt);
            } catch (DateTimeParseException e) {
                log.warn("Unparseable createdAt '{}' for notice {}", createdAt, externalRef);
            }
        }

        List<String> attachmentUrls = new ArrayList<>();
        for (JsonNode attachment : item.path("attachments")) {
            String path = attachment.path("path").asText(null);
            if (path != null && !path.isBlank()) {
                // SSC serves these as Windows-style relative paths (uploads\masterData\...);
                // confirmed via a real direct download that converting backslashes and
                // prefixing base_url/api/attachment/ resolves to a working PDF URL.
                attachmentUrls.add(source.getBaseUrl() + "/api/attachment/" + path.replace('\\', '/'));
            }
        }

        return new DiscoveredNotice(externalRef, title, noticeUrl, publishedAt, attachmentUrls);
    }

    private static int configInt(IngestionSource source, String key, int fallback) {
        if (source.getConfig() == null) {
            return fallback;
        }
        Object value = source.getConfig().get(key);
        if (value instanceof Number number) {
            return number.intValue();
        }
        return fallback;
    }
}
