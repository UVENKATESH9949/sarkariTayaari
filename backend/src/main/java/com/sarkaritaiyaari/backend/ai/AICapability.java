package com.sarkaritaiyaari.backend.ai;

/**
 * What an {@link com.sarkaritaiyaari.backend.ai.provider.AIProvider} can actually do (§11 of
 * the AI foundation brief) — checked via {@code AIProvider.supports(capability)}, never
 * assumed from a provider merely existing. Only {@code TEXT_GENERATION}/{@code CHAT} are
 * exercised by anything in this phase; the rest exist so a capability added later (a new
 * provider, or a new ability on an existing one) has somewhere to declare itself without
 * this enum's callers changing.
 */
public enum AICapability {
    TEXT_GENERATION,
    CHAT,
    STRUCTURED_OUTPUT,
    VISION,
    EMBEDDINGS,
    AUDIO,
    STREAMING
}
