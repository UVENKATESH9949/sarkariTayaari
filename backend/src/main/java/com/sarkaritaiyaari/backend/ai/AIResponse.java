package com.sarkaritaiyaari.backend.ai;

/**
 * The one response shape every future feature reads, regardless of which provider answered.
 * A provider adapter (e.g. {@code ClaudeProvider}) is responsible for translating its
 * vendor-specific reply into exactly this — nothing downstream of {@link AIService} ever
 * sees a provider's own response format.
 */
public record AIResponse(
        String content,
        String model,
        String provider,
        AIUsage usage,
        String finishReason,
        String requestId,
        long latencyMs
) {
}
