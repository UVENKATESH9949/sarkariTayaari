package com.sarkaritaiyaari.backend.ai.config;

import org.springframework.stereotype.Component;

/**
 * What {@code AIProviderRegistry}, {@code AIServiceImpl}, and {@code ClaudeProvider}
 * consult instead of reading {@link AIProperties} directly, for exactly the fields an
 * admin can change (enabled, active provider, API key, model, base URL). Everything an
 * admin does <em>not</em> configure (connect/request timeouts, max retries) still comes
 * straight from {@link AIProperties} — those stay ops-level config, not admin-facing, per
 * the AI Admin Control Center brief's own "avoid a huge configuration form" instruction.
 *
 * A {@link DynamicAiConfigSource} override always wins when present; the static
 * {@link AIProperties} value is the fallback, never the other way around — this is what
 * makes an admin's saved configuration actually take effect.
 */
@Component
public class AiConfigResolver {

    private final AIProperties staticProperties;
    private final DynamicAiConfigSource dynamicSource;

    public AiConfigResolver(AIProperties staticProperties, DynamicAiConfigSource dynamicSource) {
        this.staticProperties = staticProperties;
        this.dynamicSource = dynamicSource;
    }

    public boolean isEnabled() {
        return dynamicSource.enabledOverride().orElse(staticProperties.isEnabled());
    }

    public String activeProvider() {
        return dynamicSource.activeProviderOverride().orElse(staticProperties.getProvider());
    }

    public String apiKeyFor(String providerId) {
        return dynamicSource.credentialOverride(providerId)
                .map(ProviderCredential::apiKey)
                .filter(AiConfigResolver::nonBlank)
                .orElseGet(() -> staticFallbackFor(providerId, staticProperties.getApiKey()));
    }

    public String modelFor(String providerId) {
        return dynamicSource.credentialOverride(providerId)
                .map(ProviderCredential::model)
                .filter(AiConfigResolver::nonBlank)
                .orElseGet(() -> staticFallbackFor(providerId, staticProperties.getModel()));
    }

    public String baseUrlFor(String providerId) {
        return dynamicSource.credentialOverride(providerId)
                .map(ProviderCredential::baseUrl)
                .filter(AiConfigResolver::nonBlank)
                .orElseGet(() -> staticFallbackFor(providerId, staticProperties.getBaseUrl()));
    }

    /**
     * {@code app.ai.*} is one single-provider config slot (whichever provider {@code
     * app.ai.provider} names) — {@code app.ai.api-key} was never meant to apply to every
     * registered provider indiscriminately. Found as a real bug, not by inspection: with two
     * real HTTP-calling providers registered (Claude, Groq) and a static config naming one of
     * them, an admin enabling the *other* with no DB-saved key of its own silently inherited
     * the first one's key/model/base-url, because this method used to return the static value
     * unconditionally regardless of which provider asked. A single static provider slot
     * genuinely does not apply to a provider it was never configured for.
     */
    private String staticFallbackFor(String providerId, String staticValue) {
        if (providerId == null || !providerId.equalsIgnoreCase(staticProperties.getProvider())) {
            return null;
        }
        return staticValue;
    }

    private static boolean nonBlank(String value) {
        return value != null && !value.isBlank();
    }
}
