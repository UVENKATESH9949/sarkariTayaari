package com.sarkaritaiyaari.backend.ai.config;

/** A resolved, decrypted (if it came from the database) credential set for one provider —
 * never logged, never placed in a response DTO. See {@link DynamicAiConfigSource}. */
public record ProviderCredential(String apiKey, String model, String baseUrl) {
}
