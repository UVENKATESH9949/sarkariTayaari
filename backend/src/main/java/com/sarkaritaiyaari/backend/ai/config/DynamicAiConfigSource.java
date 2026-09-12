package com.sarkaritaiyaari.backend.ai.config;

import java.util.Optional;

/**
 * A small port: "does an admin-managed database setting override the static
 * {@code app.ai.*} configuration?" Implemented by {@code service.AiConfigurationService}
 * (the DB-aware admin layer) and consulted by {@link AiConfigResolver} — this keeps the
 * dependency direction correct: the pluggable {@code ai} package defines this interface,
 * and the admin service (which knows about Postgres/encryption) implements it, rather than
 * {@code ai.provider}/{@code ai.AIServiceImpl} depending on the admin package directly.
 *
 * Every method returns {@code Optional.empty()} to mean "no admin override exists yet —
 * fall back to the static {@code AIProperties} value," which is what makes Phase 1's
 * env-var-only mode keep working unchanged until an admin actually saves something.
 */
public interface DynamicAiConfigSource {
    Optional<Boolean> enabledOverride();

    Optional<String> activeProviderOverride();

    Optional<ProviderCredential> credentialOverride(String providerId);
}
