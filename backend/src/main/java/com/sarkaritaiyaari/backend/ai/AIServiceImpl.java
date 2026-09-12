package com.sarkaritaiyaari.backend.ai;

import com.sarkaritaiyaari.backend.ai.config.AIProperties;
import com.sarkaritaiyaari.backend.ai.config.AiConfigResolver;
import com.sarkaritaiyaari.backend.ai.exception.AIConfigurationException;
import com.sarkaritaiyaari.backend.ai.exception.AIException;
import com.sarkaritaiyaari.backend.ai.exception.AIInvalidRequestException;
import com.sarkaritaiyaari.backend.ai.exception.AIProviderUnavailableException;
import com.sarkaritaiyaari.backend.ai.exception.AIRateLimitException;
import com.sarkaritaiyaari.backend.ai.exception.AITimeoutException;
import com.sarkaritaiyaari.backend.ai.provider.AIProvider;
import com.sarkaritaiyaari.backend.ai.provider.AIProviderRegistry;
import com.sarkaritaiyaari.backend.ai.usage.AIUsageEvent;
import com.sarkaritaiyaari.backend.ai.usage.AIUsageRecorder;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

/**
 * The only place in the AI layer that resolves which provider answers a call, retries a
 * transient failure, and records a usage event — every {@code AIProvider} implementation is
 * a pure "one HTTP call, translated" adapter with none of those concerns (see
 * {@code AIProvider}'s own class doc). This is what makes adding a provider a one-file
 * change: nothing here changes when {@code ClaudeProvider} gets a sibling.
 *
 * Retry only applies to the three transient exception types (rate-limit, provider-
 * unavailable, timeout) — everything else (bad credentials, malformed request, unknown
 * model/provider, disabled-by-config) fails immediately, per §18's "don't blindly retry
 * every error."
 */
@Service
public class AIServiceImpl implements AIService {

    private static final Logger log = LoggerFactory.getLogger(AIServiceImpl.class);
    private static final long BASE_BACKOFF_MS = 500L;
    private static final long MAX_BACKOFF_MS = 4000L;

    private final AIProviderRegistry registry;
    private final AIProperties properties;
    private final AiConfigResolver configResolver;
    private final AIUsageRecorder usageRecorder;

    public AIServiceImpl(AIProviderRegistry registry, AIProperties properties, AiConfigResolver configResolver,
                          AIUsageRecorder usageRecorder) {
        this.registry = registry;
        this.properties = properties;
        this.configResolver = configResolver;
        this.usageRecorder = usageRecorder;
    }

    @Override
    public AIResponse generate(AIRequest request) {
        requireEnabled();
        if (request.messages().isEmpty()) {
            throw new AIInvalidRequestException("AIRequest.messages must not be empty");
        }

        AIProvider provider = request.provider() != null && !request.provider().isBlank()
                ? registry.resolve(request.provider())
                : registry.active();

        String requestId = UUID.randomUUID().toString();
        String feature = request.metadata().getOrDefault("feature", "unknown");
        long startedAt = System.currentTimeMillis();
        int attempt = 0;

        while (true) {
            attempt++;
            try {
                AIResponse response = provider.generate(request);
                recordUsage(response.provider(), response.model(), feature, requestId,
                        response.usage(), System.currentTimeMillis() - startedAt, "success", null);
                return response;
            } catch (AIException e) {
                boolean exhausted = attempt > properties.getMaxRetries();
                if (!isRetryable(e) || exhausted) {
                    recordUsage(provider.id(), request.model(), feature, requestId,
                            null, System.currentTimeMillis() - startedAt, "error", e.getClass().getSimpleName());
                    throw e;
                }
                long backoffMs = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS << (attempt - 1));
                log.warn("AI call failed ({}), retrying attempt {}/{} after {}ms: {}",
                        e.getClass().getSimpleName(), attempt, properties.getMaxRetries(), backoffMs, e.getMessage());
                sleep(backoffMs);
            }
        }
    }

    @Override
    public AICredentialStatus validateActiveProviderCredentials() {
        return registry.active().validateCredentials();
    }

    @Override
    public List<AIModelInfo> listModelsForActiveProvider() {
        return registry.active().listModels();
    }

    private void requireEnabled() {
        if (!configResolver.isEnabled()) {
            throw new AIConfigurationException(
                    "AI is disabled — no AI feature is live in this build yet, or an admin has turned it off");
        }
    }

    private static boolean isRetryable(AIException e) {
        return e instanceof AIRateLimitException
                || e instanceof AIProviderUnavailableException
                || e instanceof AITimeoutException;
    }

    private void recordUsage(String provider, String model, String feature, String requestId,
                              AIUsage usage, long latencyMs, String status, String errorType) {
        try {
            usageRecorder.record(new AIUsageEvent(
                    provider, model, feature, requestId,
                    usage != null ? usage.inputTokens() : 0,
                    usage != null ? usage.outputTokens() : 0,
                    usage != null ? usage.totalTokens() : 0,
                    latencyMs, status, errorType, OffsetDateTime.now()));
        } catch (Exception recordingFailure) {
            // Usage tracking must never take down a real AI call — see AIUsageRecorder's own doc.
            log.warn("Failed to record AI usage event", recordingFailure);
        }
    }

    private static void sleep(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
