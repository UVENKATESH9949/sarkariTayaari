package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.ai.AICredentialStatus;
import com.sarkaritaiyaari.backend.ai.AIModelInfo;
import com.sarkaritaiyaari.backend.ai.ProviderCredentialOverride;
import com.sarkaritaiyaari.backend.ai.config.AIProperties;
import com.sarkaritaiyaari.backend.ai.config.AiCredentialCipher;
import com.sarkaritaiyaari.backend.ai.config.DynamicAiConfigSource;
import com.sarkaritaiyaari.backend.ai.config.ProviderCredential;
import com.sarkaritaiyaari.backend.ai.exception.AIException;
import com.sarkaritaiyaari.backend.ai.provider.AIProvider;
import com.sarkaritaiyaari.backend.ai.provider.AIProviderRegistry;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.AiAdminConfigResponse;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.AiProviderConfigView;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.AiSettingsView;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.AuditLogEntryView;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.TestConnectionRequest;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.TestConnectionResponse;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.UpdateAiProviderConfigRequest;
import com.sarkaritaiyaari.backend.dto.AiConfigurationDtos.UpdateAiSettingsRequest;
import com.sarkaritaiyaari.backend.entity.AiConfigAuditLog;
import com.sarkaritaiyaari.backend.entity.AiProviderConfig;
import com.sarkaritaiyaari.backend.entity.AiSettings;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.repository.AiConfigAuditLogRepository;
import com.sarkaritaiyaari.backend.repository.AiProviderConfigRepository;
import com.sarkaritaiyaari.backend.repository.AiSettingsRepository;
import org.springframework.context.annotation.Lazy;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;

/**
 * The AI Admin Control Center's backend: reads/writes {@code ai_settings}/
 * {@code ai_provider_configs}, encrypts/decrypts provider API keys, validates a save, tests
 * a connection, and records an audit trail — never returning a plaintext key anywhere.
 *
 * Implements {@link DynamicAiConfigSource} so {@code ai.config.AiConfigResolver} (consulted
 * by {@code AIProviderRegistry}/{@code AIServiceImpl}/{@code ClaudeProvider} on every AI
 * call) can read an admin's saved override without the core {@code ai} package depending on
 * this admin-facing, DB-aware service. This class deliberately does <b>not</b> depend on
 * {@code AiConfigResolver} itself (that would be circular) — its own "DB row, else static
 * fallback" checks are the same one-line pattern, just inlined directly against
 * {@link AIProperties} where needed.
 *
 * <h2>Why {@code registry} is {@code @Lazy}</h2>
 * A genuine mutual dependency, not an accident: {@code ClaudeProvider} (one of
 * {@link AIProviderRegistry}'s own registered beans) depends on {@code AiConfigResolver},
 * which depends on this class via {@link DynamicAiConfigSource}. Eagerly injecting the
 * registry here would make Spring try to fully construct this service before the registry
 * (and everything registered inside it) can finish constructing, and vice versa — an
 * unresolvable cycle. {@code @Lazy} defers real resolution until the first admin request
 * actually needs it, by which point the whole context has already finished starting
 * normally.
 */
@Service
public class AiConfigurationService implements DynamicAiConfigSource {

    private static final String SETTINGS_ID = "default";

    private final AiSettingsRepository settingsRepository;
    private final AiProviderConfigRepository providerConfigRepository;
    private final AiConfigAuditLogRepository auditLogRepository;
    private final AIProviderRegistry registry;
    private final AIProperties staticProperties;
    private final AiCredentialCipher cipher;

    public AiConfigurationService(AiSettingsRepository settingsRepository,
                                   AiProviderConfigRepository providerConfigRepository,
                                   AiConfigAuditLogRepository auditLogRepository,
                                   @Lazy AIProviderRegistry registry,
                                   AIProperties staticProperties,
                                   AiCredentialCipher cipher) {
        this.settingsRepository = settingsRepository;
        this.providerConfigRepository = providerConfigRepository;
        this.auditLogRepository = auditLogRepository;
        this.registry = registry;
        this.staticProperties = staticProperties;
        this.cipher = cipher;
    }

    /* =================================================================== DynamicAiConfigSource */

    @Override
    @Transactional(readOnly = true)
    public Optional<Boolean> enabledOverride() {
        return settingsRepository.findById(SETTINGS_ID).map(AiSettings::getEnabled);
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<String> activeProviderOverride() {
        return settingsRepository.findById(SETTINGS_ID)
                .map(AiSettings::getActiveProvider)
                .filter(v -> v != null && !v.isBlank());
    }

    @Override
    @Transactional(readOnly = true)
    public Optional<ProviderCredential> credentialOverride(String providerId) {
        return providerConfigRepository.findById(canonical(providerId)).map(config -> {
            String apiKey = nonBlank(config.getEncryptedApiKey()) ? cipher.decrypt(config.getEncryptedApiKey()) : null;
            return new ProviderCredential(apiKey, config.getModel(), config.getBaseUrl());
        });
    }

    /* =================================================================== Admin reads */

    @Transactional(readOnly = true)
    public AiAdminConfigResponse getAdminConfig() {
        AiSettingsView settingsView = toSettingsView(requireSettingsRow());

        List<String> availableProviders = registry.registeredProviderIds().stream()
                .map(id -> id.toUpperCase(Locale.ROOT))
                .sorted()
                .toList();

        List<AiProviderConfigView> providerViews = availableProviders.stream()
                .map(this::providerViewFor)
                .toList();

        return new AiAdminConfigResponse(settingsView, availableProviders, providerViews);
    }

    @Transactional(readOnly = true)
    public List<AIModelInfo> listModels(String providerId) {
        return registry.resolve(providerId.toLowerCase(Locale.ROOT)).listModels();
    }

    @Transactional(readOnly = true)
    public List<AuditLogEntryView> getAuditLog() {
        return auditLogRepository.findTop50ByOrderByChangedAtDesc().stream()
                .map(e -> new AuditLogEntryView(e.getChangedAt(), e.getChangedByEmail(), e.getAction(), e.getProvider(), e.getSummary()))
                .toList();
    }

    /* =================================================================== Admin writes */

    @Transactional
    public AiSettingsView updateSettings(User admin, UpdateAiSettingsRequest request) {
        String resolvedProvider = nonBlank(request.activeProvider()) ? request.activeProvider().toLowerCase(Locale.ROOT) : null;
        if (resolvedProvider != null && !registry.registeredProviderIds().contains(resolvedProvider)) {
            throw new IllegalArgumentException("Unknown or not-yet-implemented AI provider: " + request.activeProvider());
        }

        AiSettings settings = requireSettingsRow();
        long currentVersion = settings.getVersion() != null ? settings.getVersion() : 0L;
        if (currentVersion != request.expectedVersion()) {
            throw new ObjectOptimisticLockingFailureException(AiSettings.class, SETTINGS_ID);
        }

        if (request.enabled()) {
            String effectiveProvider = resolvedProvider != null ? resolvedProvider
                    : (nonBlank(settings.getActiveProvider()) ? settings.getActiveProvider() : staticProperties.getProvider());
            if (!nonBlank(effectiveProvider)) {
                throw new IllegalArgumentException("Cannot enable AI: no active provider is configured.");
            }
            if (!"mock".equalsIgnoreCase(effectiveProvider) && !effectiveApiKeyConfigured(effectiveProvider)) {
                throw new IllegalArgumentException(
                        "Cannot enable AI: no API key is configured for " + effectiveProvider.toUpperCase(Locale.ROOT)
                                + ". Configure a key first.");
            }
        }

        boolean enabledChanged = !Objects.equals(settings.getEnabled(), request.enabled());
        boolean providerChanged = !Objects.equals(settings.getActiveProvider(), resolvedProvider);

        settings.setEnabled(request.enabled());
        settings.setActiveProvider(resolvedProvider);
        settings.setUpdatedAt(OffsetDateTime.now());
        settings.setUpdatedByEmail(admin.getEmail());
        settingsRepository.save(settings);

        if (enabledChanged) {
            audit(admin, request.enabled() ? "AI_ENABLED" : "AI_DISABLED", null,
                    request.enabled() ? "AI enabled" : "AI disabled");
        }
        if (providerChanged) {
            audit(admin, "ACTIVE_PROVIDER_CHANGED", resolvedProvider != null ? resolvedProvider.toUpperCase(Locale.ROOT) : null,
                    "Active provider changed to "
                            + (resolvedProvider != null ? resolvedProvider.toUpperCase(Locale.ROOT) : "(cleared — using default)"));
        }

        return toSettingsView(settings);
    }

    @Transactional
    public AiProviderConfigView updateProviderConfig(User admin, String providerId, UpdateAiProviderConfigRequest request) {
        String normalized = providerId.toLowerCase(Locale.ROOT);
        if (!registry.registeredProviderIds().contains(normalized)) {
            throw new IllegalArgumentException("Unknown or not-yet-implemented AI provider: " + providerId);
        }
        String canonical = normalized.toUpperCase(Locale.ROOT);

        AiProviderConfig config = providerConfigRepository.findById(canonical).orElseGet(() -> {
            AiProviderConfig created = new AiProviderConfig();
            created.setProvider(canonical);
            return created;
        });

        long currentVersion = config.getVersion() != null ? config.getVersion() : 0L;
        if (currentVersion != request.expectedVersion()) {
            throw new ObjectOptimisticLockingFailureException(AiProviderConfig.class, canonical);
        }

        List<String> changedFields = new ArrayList<>();
        String newModel = blankToNull(request.model());
        String newBaseUrl = blankToNull(request.baseUrl());
        boolean keyChanged = nonBlank(request.apiKey());

        if (!Objects.equals(config.getModel(), newModel)) {
            changedFields.add("model");
        }
        if (!Objects.equals(config.getBaseUrl(), newBaseUrl)) {
            changedFields.add("base URL");
        }
        if (keyChanged) {
            changedFields.add("API key");
        }

        config.setModel(newModel);
        config.setBaseUrl(newBaseUrl);
        if (keyChanged) {
            config.setEncryptedApiKey(cipher.encrypt(request.apiKey()));
        }
        config.setUpdatedAt(OffsetDateTime.now());
        config.setUpdatedByEmail(admin.getEmail());
        providerConfigRepository.save(config);

        if (!changedFields.isEmpty()) {
            audit(admin, "PROVIDER_CONFIG_UPDATED", canonical,
                    "Updated " + canonical + " configuration: " + String.join(", ", changedFields));
        }

        return toProviderConfigView(config);
    }

    @Transactional
    public TestConnectionResponse testConnection(User admin, String providerId, TestConnectionRequest request) {
        String normalized = providerId.toLowerCase(Locale.ROOT);
        AIProvider provider = registry.resolve(normalized);
        String canonical = normalized.toUpperCase(Locale.ROOT);

        String apiKey = firstNonBlank(request.apiKey(), effectiveApiKey(normalized));
        String model = firstNonBlank(request.model(), effectiveModel(normalized));
        String baseUrl = firstNonBlank(request.baseUrl(), effectiveBaseUrl(normalized));

        long startedAt = System.currentTimeMillis();
        boolean success;
        String message;
        try {
            AICredentialStatus status = provider.validateCredentials(new ProviderCredentialOverride(apiKey, model, baseUrl));
            success = status.valid();
            message = status.message();
        } catch (AIException e) {
            success = false;
            message = e.getMessage();
        }
        long latencyMs = System.currentTimeMillis() - startedAt;

        recordTestResult(canonical, success, latencyMs, message);
        audit(admin, "TEST_CONNECTION", canonical,
                success ? ("Test connection to " + canonical + " succeeded (" + latencyMs + "ms)")
                        : ("Test connection to " + canonical + " failed: " + message));

        return new TestConnectionResponse(success, canonical, model, latencyMs, message);
    }

    /* =================================================================== internals */

    private AiSettings requireSettingsRow() {
        return settingsRepository.findById(SETTINGS_ID)
                .orElseThrow(() -> new IllegalStateException("ai_settings row is missing — V40 should have seeded it"));
    }

    private boolean effectiveApiKeyConfigured(String providerId) {
        return nonBlank(effectiveApiKey(providerId));
    }

    private String effectiveApiKey(String providerId) {
        return credentialOverride(providerId).map(ProviderCredential::apiKey)
                .filter(AiConfigurationService::nonBlank)
                .orElse(staticProperties.getApiKey());
    }

    private String effectiveModel(String providerId) {
        return credentialOverride(providerId).map(ProviderCredential::model)
                .filter(AiConfigurationService::nonBlank)
                .orElse(staticProperties.getModel());
    }

    private String effectiveBaseUrl(String providerId) {
        return credentialOverride(providerId).map(ProviderCredential::baseUrl)
                .filter(AiConfigurationService::nonBlank)
                .orElse(staticProperties.getBaseUrl());
    }

    private void recordTestResult(String canonicalProvider, boolean success, long latencyMs, String message) {
        AiProviderConfig config = providerConfigRepository.findById(canonicalProvider).orElseGet(() -> {
            AiProviderConfig created = new AiProviderConfig();
            created.setProvider(canonicalProvider);
            return created;
        });
        config.setLastTestAt(OffsetDateTime.now());
        config.setLastTestStatus(success ? "SUCCESS" : "FAILED");
        config.setLastTestLatencyMs(latencyMs);
        config.setLastTestMessage(message);
        providerConfigRepository.save(config);
    }

    private void audit(User admin, String action, String provider, String summary) {
        AiConfigAuditLog entry = new AiConfigAuditLog();
        entry.setId(UUID.randomUUID());
        entry.setChangedAt(OffsetDateTime.now());
        entry.setChangedBy(admin.getId());
        entry.setChangedByEmail(admin.getEmail());
        entry.setAction(action);
        entry.setProvider(provider);
        entry.setSummary(summary);
        auditLogRepository.save(entry);
    }

    private AiSettingsView toSettingsView(AiSettings settings) {
        boolean enabledOverridden = settings.getEnabled() != null;
        boolean providerOverridden = nonBlank(settings.getActiveProvider());
        boolean effectiveEnabled = enabledOverridden ? settings.getEnabled() : staticProperties.isEnabled();
        String effectiveProvider = providerOverridden ? settings.getActiveProvider() : staticProperties.getProvider();
        return new AiSettingsView(
                effectiveEnabled,
                enabledOverridden,
                nonBlank(effectiveProvider) ? effectiveProvider.toUpperCase(Locale.ROOT) : null,
                providerOverridden,
                settings.getVersion() != null ? settings.getVersion() : 0L);
    }

    private AiProviderConfigView providerViewFor(String canonicalProvider) {
        return providerConfigRepository.findById(canonicalProvider)
                .map(this::toProviderConfigView)
                .orElseGet(() -> unconfiguredProviderView(canonicalProvider));
    }

    private AiProviderConfigView unconfiguredProviderView(String canonicalProvider) {
        boolean isMock = "MOCK".equals(canonicalProvider);
        boolean configured = isMock || nonBlank(staticProperties.getApiKey());
        boolean baseUrlConfigured = nonBlank(staticProperties.getBaseUrl());
        return new AiProviderConfigView(
                canonicalProvider, configured, blankToNull(staticProperties.getModel()), baseUrlConfigured,
                null, null, "NOT_TESTED", null, null, null, 0L);
    }

    private AiProviderConfigView toProviderConfigView(AiProviderConfig config) {
        boolean isMock = "MOCK".equals(config.getProvider());
        boolean configured = isMock || nonBlank(config.getEncryptedApiKey()) || nonBlank(staticProperties.getApiKey());
        String effectiveModel = nonBlank(config.getModel()) ? config.getModel() : staticProperties.getModel();
        boolean baseUrlConfigured = nonBlank(config.getBaseUrl()) || nonBlank(staticProperties.getBaseUrl());
        return new AiProviderConfigView(
                config.getProvider(),
                configured,
                blankToNull(effectiveModel),
                baseUrlConfigured,
                config.getUpdatedAt(),
                config.getUpdatedByEmail(),
                config.getLastTestStatus() != null ? config.getLastTestStatus() : "NOT_TESTED",
                config.getLastTestAt(),
                config.getLastTestLatencyMs(),
                config.getLastTestMessage(),
                config.getVersion() != null ? config.getVersion() : 0L);
    }

    private static String canonical(String providerId) {
        return providerId.toUpperCase(Locale.ROOT);
    }

    private static boolean nonBlank(String value) {
        return value != null && !value.isBlank();
    }

    private static String blankToNull(String value) {
        return nonBlank(value) ? value : null;
    }

    private static String firstNonBlank(String a, String b) {
        return nonBlank(a) ? a : b;
    }
}
