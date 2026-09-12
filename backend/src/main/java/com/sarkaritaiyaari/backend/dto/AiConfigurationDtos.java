package com.sarkaritaiyaari.backend.dto;

import java.time.OffsetDateTime;
import java.util.List;

/** AI Admin Control Center — see AiConfigurationService's class comment for the
 * DB-override-vs-static-fallback design these DTOs surface. None of these ever carry a
 * plaintext API key — {@link AiProviderConfigView#configured()} is the closest any
 * response gets to describing one. */
public final class AiConfigurationDtos {

    private AiConfigurationDtos() {
    }

    public record AiSettingsView(
            boolean enabled,
            boolean enabledIsOverridden,
            String activeProvider,
            boolean activeProviderIsOverridden,
            long version) {
    }

    public record AiProviderConfigView(
            String provider,
            boolean configured,
            String model,
            boolean baseUrlConfigured,
            OffsetDateTime updatedAt,
            String updatedByEmail,
            String lastTestStatus,
            OffsetDateTime lastTestAt,
            Long lastTestLatencyMs,
            String lastTestMessage,
            long version) {
    }

    public record AiAdminConfigResponse(
            AiSettingsView settings,
            List<String> availableProviders,
            List<AiProviderConfigView> providers) {
    }

    public record UpdateAiSettingsRequest(
            boolean enabled,
            /** Nullable — clears the override back to the static app.ai.provider default. */
            String activeProvider,
            long expectedVersion) {
    }

    public record UpdateAiProviderConfigRequest(
            String model,
            /** Blank/omitted = leave the currently stored key unchanged (§7/§16). */
            String apiKey,
            String baseUrl,
            long expectedVersion) {
    }

    /** All three fields optional — omitted means "use the currently saved (or
     * static-fallback) value for that field," per §13/§17's draft-test flow. */
    public record TestConnectionRequest(String apiKey, String model, String baseUrl) {
    }

    public record TestConnectionResponse(
            boolean success,
            String provider,
            String model,
            Long latencyMs,
            String message) {
    }

    public record AuditLogEntryView(
            OffsetDateTime changedAt,
            String changedByEmail,
            String action,
            String provider,
            String summary) {
    }
}
