package com.sarkaritaiyaari.backend.ai.usage;

import java.time.OffsetDateTime;

/**
 * One row of "what happened," per AI call — the extension point for future usage/cost
 * tracking (§14/§15). No pricing logic lives here on purpose: a future cost-calculation
 * layer would read {@code provider}/{@code model}/{@code totalTokens} and look up its own
 * separate, isolated pricing configuration — keeping per-model pricing out of this record
 * and out of the provider abstraction entirely, so a price change never touches either.
 */
public record AIUsageEvent(
        String provider,
        String model,
        String feature,
        String requestId,
        int inputTokens,
        int outputTokens,
        int totalTokens,
        long latencyMs,
        String status,
        String errorType,
        OffsetDateTime timestamp
) {
}
