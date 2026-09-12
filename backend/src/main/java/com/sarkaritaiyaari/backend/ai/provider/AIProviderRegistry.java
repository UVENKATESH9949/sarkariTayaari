package com.sarkaritaiyaari.backend.ai.provider;

import com.sarkaritaiyaari.backend.ai.config.AiConfigResolver;
import com.sarkaritaiyaari.backend.ai.exception.AIUnknownProviderException;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * Resolves "which {@link AIProvider} bean answers a call" from configuration — the same
 * {@code Map<String, Interface>} keyed by bean name that {@code ingestion.NoticeSourceAdapter}
 * already uses in this codebase, chosen over an {@code if/else} chain per §9's explicit
 * requirement that adding a provider must not touch existing conditional logic. Spring
 * auto-populates the injected map from every {@code AIProvider} bean, keyed by its
 * {@code @Component} name.
 */
@Component
public class AIProviderRegistry {

    private final Map<String, AIProvider> providers;
    private final AiConfigResolver configResolver;

    public AIProviderRegistry(Map<String, AIProvider> providers, AiConfigResolver configResolver) {
        this.providers = providers;
        this.configResolver = configResolver;
    }

    /** The provider named by {@code app.ai.provider} — or an admin's saved override, if
     * one exists (see {@link AiConfigResolver}). */
    public AIProvider active() {
        return resolve(configResolver.activeProvider());
    }

    public AIProvider resolve(String providerId) {
        if (providerId == null || providerId.isBlank()) {
            throw new AIUnknownProviderException("No AI provider configured (app.ai.provider is empty)");
        }
        AIProvider provider = providers.get(providerId.toLowerCase(Locale.ROOT));
        if (provider == null) {
            throw new AIUnknownProviderException("Unknown or not-yet-implemented AI provider: " + providerId);
        }
        return provider;
    }

    /** Every provider id actually registered as a Spring bean (e.g. {@code "claude"},
     * {@code "mock"}) — used to build the admin "available providers" list without
     * hardcoding a provider name anywhere, backend or frontend (§5/§35). */
    public Set<String> registeredProviderIds() {
        return Collections.unmodifiableSet(providers.keySet());
    }
}
