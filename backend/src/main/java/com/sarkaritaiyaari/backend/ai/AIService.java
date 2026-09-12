package com.sarkaritaiyaari.backend.ai;

import java.util.List;

/**
 * The one interface a future feature depends on — never {@code ClaudeProvider}, never any
 * vendor SDK. See {@code system-design/06-ai-foundation.md} for the full rationale and
 * "how to add a provider" guide, and {@code AIServiceImpl} for where retry/timeout/usage
 * tracking actually live.
 *
 * Example future usage: {@code aiService.generate(request)} — never
 * {@code claudeClient.call(...)} anywhere outside this package.
 */
public interface AIService {

    /** Runs one AI call through the currently-configured (or request-overridden) provider,
     * with centralized retry, timeout and usage recording. Throws an
     * {@code ai.exception.AIException} subtype on any failure — never a raw provider/HTTP
     * exception (§31). */
    AIResponse generate(AIRequest request);

    /** Cheap connectivity/credentials check for the active provider — the foundation for a
     * future admin "Test connection" action (§8). */
    AICredentialStatus validateActiveProviderCredentials();

    List<AIModelInfo> listModelsForActiveProvider();
}
