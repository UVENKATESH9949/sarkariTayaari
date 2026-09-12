package com.sarkaritaiyaari.backend.ai.usage;

/** Extension point (§14) — a future {@code DatabaseAIUsageRecorder} can implement this and
 * replace {@code LoggingAIUsageRecorder} via a {@code @Primary} bean, with zero change to
 * {@code AIServiceImpl}, once a real feature needs queryable usage history. */
public interface AIUsageRecorder {
    void record(AIUsageEvent event);
}
