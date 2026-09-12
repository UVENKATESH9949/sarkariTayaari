package com.sarkaritaiyaari.backend.ai;

/** Token accounting for one call. No pricing lives here on purpose — see
 * {@code ai.usage.AIUsageEvent}'s class doc for why cost calculation is kept as a separate,
 * later concern rather than baked into this shape. */
public record AIUsage(int inputTokens, int outputTokens, int totalTokens) {
    public static AIUsage of(int inputTokens, int outputTokens) {
        return new AIUsage(inputTokens, outputTokens, inputTokens + outputTokens);
    }
}
