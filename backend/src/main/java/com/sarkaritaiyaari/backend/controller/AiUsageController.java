package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.repository.AiUsageRecordRepository;
import com.sarkaritaiyaari.backend.repository.AiUsageRecordRepository.AiUsageSummaryRow;
import com.sarkaritaiyaari.backend.service.AuthService;
import org.springframework.http.HttpHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.List;

/**
 * Read-only AI usage aggregates, so "what are we spending, on what" is answerable without
 * grepping a machine's stdout. Admin-only: this exposes no student data, but it does expose the
 * shape of the project's AI spend, which is operational rather than public information.
 *
 * <p>Reports tokens, never money. Per-model pricing changes on the vendor's schedule and belongs
 * to whoever reads this, not frozen into the backend — the same separation
 * {@code AIUsageEvent}'s own doc comment established before any of this was stored.
 */
@RestController
@RequestMapping("/api/admin/ai-usage")
public class AiUsageController {

    private static final int DEFAULT_WINDOW_DAYS = 30;

    private final AuthService authService;
    private final AiUsageRecordRepository repository;

    public AiUsageController(AuthService authService, AiUsageRecordRepository repository) {
        this.authService = authService;
        this.repository = repository;
    }

    @GetMapping("/summary")
    public UsageSummaryResponse summary(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
                                         @RequestParam(required = false) String since) {
        authService.requireAdmin(authorization);
        OffsetDateTime from = parseSince(since);

        List<FeatureUsage> features = repository.summarizeSince(from).stream()
                .map(AiUsageController::toFeatureUsage)
                .toList();

        long totalCalls = features.stream().mapToLong(FeatureUsage::calls).sum();
        long totalInput = features.stream().mapToLong(FeatureUsage::inputTokens).sum();
        long totalOutput = features.stream().mapToLong(FeatureUsage::outputTokens).sum();
        long totalFailures = features.stream().mapToLong(FeatureUsage::failures).sum();

        return new UsageSummaryResponse(from, totalCalls, totalInput, totalOutput,
                totalInput + totalOutput, totalFailures, features);
    }

    private static FeatureUsage toFeatureUsage(AiUsageSummaryRow row) {
        return new FeatureUsage(row.getFeature(), row.getModel(), row.getCalls(),
                row.getInputTokens(), row.getOutputTokens(),
                row.getInputTokens() + row.getOutputTokens(), row.getFailures());
    }

    /** Mirrors {@code QuestionService.parseSince}'s convention: an ISO instant, or a default window. */
    private OffsetDateTime parseSince(String since) {
        if (since == null || since.isBlank() || "0".equals(since)) {
            return OffsetDateTime.now().minusDays(DEFAULT_WINDOW_DAYS);
        }
        try {
            return OffsetDateTime.parse(since);
        } catch (DateTimeParseException e) {
            // Same message shape as QuestionService.parseSince, and it steers to the "Z" form for
            // a concrete reason: a "+05:30" offset decodes as a space in a query string unless the
            // caller percent-encodes it, which is a genuinely easy mistake to make by hand.
            throw new IllegalArgumentException(
                    "Invalid 'since' timestamp: " + since + ". Use ISO-8601 UTC (e.g. 2026-01-01T00:00:00Z).");
        }
    }

    public record FeatureUsage(String feature, String model, long calls,
                                long inputTokens, long outputTokens, long totalTokens, long failures) {
    }

    public record UsageSummaryResponse(OffsetDateTime since, long totalCalls,
                                        long totalInputTokens, long totalOutputTokens, long totalTokens,
                                        long totalFailures, List<FeatureUsage> byFeature) {
    }
}
