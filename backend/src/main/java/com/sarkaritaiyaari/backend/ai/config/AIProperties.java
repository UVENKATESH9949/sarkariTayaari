package com.sarkaritaiyaari.backend.ai.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Every AI-layer configuration value, read once at startup via {@code @Value} — matches this
 * codebase's existing convention ({@code AuthService}/{@code CorsConfig}/
 * {@code CloudinaryConfig} all do the same) rather than introducing
 * {@code @ConfigurationProperties} as a new style in one corner of the app. See
 * {@code system-design/06-ai-foundation.md} for the full precedence model and how to set
 * each of these locally (mirrors the existing Cloudinary-credential convention in
 * {@code application-local.yml.example}).
 *
 * {@code enabled} defaults false and {@code provider} defaults {@code MOCK} — the same
 * "off unless explicitly turned on" posture this codebase already uses for
 * {@code app.epic-l.synthetic-seed-enabled} / {@code app.exam-guide.demo-seed-enabled} — so a
 * fresh checkout with zero configuration boots cleanly and any future call into
 * {@code AIService} fails loudly and safely rather than doing something unintended.
 */
@Component
public class AIProperties {

    private final boolean enabled;
    private final String provider;
    private final String apiKey;
    private final String model;
    private final String baseUrl;
    private final long connectTimeoutMs;
    private final long requestTimeoutMs;
    private final int maxRetries;

    public AIProperties(
            @Value("${app.ai.enabled:false}") boolean enabled,
            @Value("${app.ai.provider:MOCK}") String provider,
            @Value("${app.ai.api-key:}") String apiKey,
            @Value("${app.ai.model:}") String model,
            @Value("${app.ai.base-url:}") String baseUrl,
            @Value("${app.ai.connect-timeout-ms:10000}") long connectTimeoutMs,
            @Value("${app.ai.request-timeout-ms:60000}") long requestTimeoutMs,
            @Value("${app.ai.max-retries:2}") int maxRetries) {
        this.enabled = enabled;
        this.provider = provider;
        this.apiKey = apiKey;
        this.model = model;
        this.baseUrl = baseUrl;
        this.connectTimeoutMs = connectTimeoutMs;
        this.requestTimeoutMs = requestTimeoutMs;
        this.maxRetries = maxRetries;
    }

    public boolean isEnabled() {
        return enabled;
    }

    public String getProvider() {
        return provider;
    }

    /** Never log this value. Never place it in a response DTO. */
    public String getApiKey() {
        return apiKey;
    }

    public String getModel() {
        return model;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public long getConnectTimeoutMs() {
        return connectTimeoutMs;
    }

    public long getRequestTimeoutMs() {
        return requestTimeoutMs;
    }

    public int getMaxRetries() {
        return maxRetries;
    }
}
