package com.sarkaritaiyaari.backend.ai.provider;

import com.sarkaritaiyaari.backend.ai.AICapability;
import com.sarkaritaiyaari.backend.ai.AICredentialStatus;
import com.sarkaritaiyaari.backend.ai.AIModelInfo;
import com.sarkaritaiyaari.backend.ai.AIRequest;
import com.sarkaritaiyaari.backend.ai.AIResponse;
import com.sarkaritaiyaari.backend.ai.ProviderCredentialOverride;

import java.util.List;
import java.util.function.Consumer;

/**
 * One implementation per external AI vendor. Never called directly by feature code — always
 * through {@code AIService}, which is what keeps swapping a vendor a one-file change (see
 * {@code AIServiceImpl}'s class doc, and the "six months later" question this whole layer is
 * designed to answer).
 *
 * A provider implementation must:
 * <ul>
 *   <li>throw only {@code ai.exception.AIException} subtypes — never let a raw
 *       {@code IOException}/{@code HttpTimeoutException}/vendor error body escape.
 *       {@code AIServiceImpl}'s retry policy and {@code GlobalExceptionHandler} both key off
 *       those types, not off anything vendor-specific.</li>
 *   <li>never apply its own retry loop — {@code AIServiceImpl} is the single place that
 *       retries (§18's "keep retry logic centralized").</li>
 *   <li>never log the API key or the raw prompt/response content (§16).</li>
 * </ul>
 */
public interface AIProvider {

    /** Registry key — matches this bean's {@code @Component} name and {@code app.ai.provider}
     * (case-insensitive). */
    String id();

    AIResponse generate(AIRequest request);

    boolean supports(AICapability capability);

    /** Real, live list of models this provider currently offers — never hardcoded, so it
     * can't go stale as a vendor adds or retires models (§10). */
    List<AIModelInfo> listModels();

    /** Cheap enough to call on demand — e.g. from a future admin "Test connection" action
     * (§8). Implementations should let anything other than an authentication failure
     * propagate rather than reporting a false "invalid" for an unrelated problem. */
    AICredentialStatus validateCredentials();

    /**
     * Same as {@link #validateCredentials()}, but against an explicit, not-yet-saved
     * credential set — e.g. an admin's draft form before clicking Save. The caller is
     * responsible for merging any blank draft field with the already-effective value
     * first (see {@code AiConfigurationService.testConnection}); a provider overriding
     * this method does no merge logic of its own. Providers that don't override this
     * simply ignore the draft and test their already-resolved configuration instead.
     */
    default AICredentialStatus validateCredentials(ProviderCredentialOverride override) {
        return validateCredentials();
    }

    /**
     * Streaming extension point (§13) — deliberately unimplemented in Phase 1. A provider
     * that adds streaming later overrides this instead of the interface changing.
     */
    default void stream(AIRequest request, Consumer<String> onToken) {
        throw new UnsupportedOperationException(id() + " does not support streaming yet");
    }
}
