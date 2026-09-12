package com.sarkaritaiyaari.backend.ai.usage;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Default {@link AIUsageRecorder} — one structured log line per call, never the prompt/
 * response content or the API key (§16). Sufficient until a real feature needs queryable
 * usage history, per §14/§15's explicit instruction not to build database storage before
 * something actually needs it (§21).
 */
@Component
public class LoggingAIUsageRecorder implements AIUsageRecorder {

    private static final Logger log = LoggerFactory.getLogger("ai.usage");

    @Override
    public void record(AIUsageEvent event) {
        log.info("provider={} model={} feature={} requestId={} inputTokens={} outputTokens={} totalTokens={} latencyMs={} status={} errorType={}",
                event.provider(), event.model(), event.feature(), event.requestId(),
                event.inputTokens(), event.outputTokens(), event.totalTokens(), event.latencyMs(),
                event.status(), event.errorType());
    }
}
