package com.sarkaritaiyaari.backend.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * One persisted AI call. Deliberately named {@code AiUsageRecord} rather than mirroring
 * {@code ai.usage.AIUsageEvent}'s name — that record is the in-memory event the provider layer
 * emits, this is the stored row, and having two types one capitalisation apart would be a
 * genuinely confusing pair to read at a call site.
 */
@Entity
@Table(name = "ai_usage_events")
public class AiUsageRecord {

    @Id
    private UUID id;

    @Column(name = "provider", nullable = false)
    private String provider;

    @Column(name = "model")
    private String model;

    @Column(name = "feature")
    private String feature;

    @Column(name = "request_id")
    private String requestId;

    @Column(name = "input_tokens", nullable = false)
    private int inputTokens;

    @Column(name = "output_tokens", nullable = false)
    private int outputTokens;

    @Column(name = "total_tokens", nullable = false)
    private int totalTokens;

    @Column(name = "latency_ms", nullable = false)
    private long latencyMs;

    @Column(name = "status", nullable = false)
    private String status;

    @Column(name = "error_type")
    private String errorType;

    @Column(name = "occurred_at", nullable = false)
    private OffsetDateTime occurredAt;

    public UUID getId() { return id; }
    public void setId(UUID id) { this.id = id; }

    public String getProvider() { return provider; }
    public void setProvider(String provider) { this.provider = provider; }

    public String getModel() { return model; }
    public void setModel(String model) { this.model = model; }

    public String getFeature() { return feature; }
    public void setFeature(String feature) { this.feature = feature; }

    public String getRequestId() { return requestId; }
    public void setRequestId(String requestId) { this.requestId = requestId; }

    public int getInputTokens() { return inputTokens; }
    public void setInputTokens(int inputTokens) { this.inputTokens = inputTokens; }

    public int getOutputTokens() { return outputTokens; }
    public void setOutputTokens(int outputTokens) { this.outputTokens = outputTokens; }

    public int getTotalTokens() { return totalTokens; }
    public void setTotalTokens(int totalTokens) { this.totalTokens = totalTokens; }

    public long getLatencyMs() { return latencyMs; }
    public void setLatencyMs(long latencyMs) { this.latencyMs = latencyMs; }

    public String getStatus() { return status; }
    public void setStatus(String status) { this.status = status; }

    public String getErrorType() { return errorType; }
    public void setErrorType(String errorType) { this.errorType = errorType; }

    public OffsetDateTime getOccurredAt() { return occurredAt; }
    public void setOccurredAt(OffsetDateTime occurredAt) { this.occurredAt = occurredAt; }
}
