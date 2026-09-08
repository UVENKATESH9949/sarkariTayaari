package com.sarkaritaiyaari.backend.ingestion;

import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

/**
 * TASK-2401 Document 5/16 -- downloads raw bytes from an already-SSRF-checked URL, with a
 * conservative size cap (Document 16's "cap file size/timeout"). Deliberately dumb: no
 * PDF-specific validation here -- that's {@code DocumentStoreService}'s job, applied
 * uniformly regardless of where the bytes came from.
 */
@Component
public class DocumentFetcher {

    private static final String USER_AGENT =
            "SarkariTaiyaariIngestionBot/1.0 (+https://sarkaritaiyaari.app; admin@sarkaritaiyaari.app)";

    /** Conservative for this pipeline's real-world evidence (the largest real SSC notice
     * PDF seen during Task 1's investigation was ~3.4MB) -- generous headroom without
     * inviting a runaway download. Public (TASK-2501 Phase 2) so
     * {@code QuestionIngestionController}'s local-file-upload path enforces the exact same
     * cap as this URL-fetch path, rather than a second, possibly-drifting number. */
    public static final long MAX_BYTES = 20_000_000;

    private final HttpClient httpClient = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(15)).build();

    public byte[] fetch(String url) {
        OutboundUrlGuard.requireSafe(url);
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(url))
                    .timeout(Duration.ofSeconds(30))
                    .header("User-Agent", USER_AGENT)
                    .GET()
                    .build();
            HttpResponse<byte[]> response = httpClient.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() != 200) {
                throw new IllegalStateException("Document fetch returned HTTP " + response.statusCode() + ": " + url);
            }
            byte[] body = response.body();
            if (body.length > MAX_BYTES) {
                throw new IllegalStateException(
                        "Document exceeds the " + MAX_BYTES + "-byte cap (" + body.length + " bytes): " + url);
            }
            return body;
        } catch (IOException e) {
            throw new IllegalStateException("Failed to fetch document: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("Interrupted while fetching document", e);
        }
    }
}
