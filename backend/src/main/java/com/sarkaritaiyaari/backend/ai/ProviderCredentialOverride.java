package com.sarkaritaiyaari.backend.ai;

/**
 * An explicit, not-yet-saved credential set to test against — e.g. an admin's draft form
 * before clicking Save (§13/§17 of the AI Admin Control Center brief). Never persisted,
 * never logged. All three fields are expected to be fully populated by the caller (the
 * caller merges any blank draft field with the already-effective value first) — a provider
 * implementing {@link com.sarkaritaiyaari.backend.ai.provider.AIProvider#validateCredentials(ProviderCredentialOverride)}
 * does no merge logic of its own.
 */
public record ProviderCredentialOverride(String apiKey, String model, String baseUrl) {
}
