package com.sarkaritaiyaari.backend.ai;

import java.util.List;
import java.util.Map;

/**
 * The one request shape every future feature builds, regardless of which provider ends up
 * answering it (see {@link AIService}). {@code provider}/{@code model} are optional per-call
 * overrides — null means "use whatever {@code app.ai.provider}/{@code app.ai.model} is
 * configured" (the request-level layer of the precedence chain documented in
 * {@code system-design/06-ai-foundation.md}). {@code metadata} is free-form; the one key
 * {@link AIServiceImpl} itself reads is {@code "feature"}, to tag the usage event this call
 * produces — nothing in {@code metadata} ever reaches a provider's own HTTP request.
 *
 * Emptiness of {@code messages} is validated by {@link AIServiceImpl}, not here — this record
 * is also built directly in provider-level tests, where a throwing constructor would be an
 * unwelcome surprise for an otherwise-valid partial fixture.
 */
public record AIRequest(
        String provider,
        String model,
        String systemPrompt,
        List<AIMessage> messages,
        Double temperature,
        Integer maxTokens,
        ResponseFormat responseFormat,
        Map<String, String> metadata
) {
    public AIRequest {
        if (messages == null) {
            messages = List.of();
        }
        if (responseFormat == null) {
            responseFormat = ResponseFormat.TEXT;
        }
        if (metadata == null) {
            metadata = Map.of();
        }
    }

    public static Builder builder() {
        return new Builder();
    }

    public static final class Builder {
        private String provider;
        private String model;
        private String systemPrompt;
        private List<AIMessage> messages = List.of();
        private Double temperature;
        private Integer maxTokens;
        private ResponseFormat responseFormat;
        private Map<String, String> metadata = Map.of();

        private Builder() {
        }

        public Builder provider(String provider) {
            this.provider = provider;
            return this;
        }

        public Builder model(String model) {
            this.model = model;
            return this;
        }

        public Builder systemPrompt(String systemPrompt) {
            this.systemPrompt = systemPrompt;
            return this;
        }

        public Builder messages(List<AIMessage> messages) {
            this.messages = messages;
            return this;
        }

        public Builder temperature(Double temperature) {
            this.temperature = temperature;
            return this;
        }

        public Builder maxTokens(Integer maxTokens) {
            this.maxTokens = maxTokens;
            return this;
        }

        public Builder responseFormat(ResponseFormat responseFormat) {
            this.responseFormat = responseFormat;
            return this;
        }

        public Builder metadata(Map<String, String> metadata) {
            this.metadata = metadata;
            return this;
        }

        public AIRequest build() {
            return new AIRequest(provider, model, systemPrompt, messages, temperature, maxTokens, responseFormat, metadata);
        }
    }
}
