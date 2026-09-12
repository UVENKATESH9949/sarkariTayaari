package com.sarkaritaiyaari.backend.ai.provider.claude;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sarkaritaiyaari.backend.ai.AICapability;
import com.sarkaritaiyaari.backend.ai.AICredentialStatus;
import com.sarkaritaiyaari.backend.ai.AIMessage;
import com.sarkaritaiyaari.backend.ai.AIModelInfo;
import com.sarkaritaiyaari.backend.ai.AIRequest;
import com.sarkaritaiyaari.backend.ai.AIResponse;
import com.sarkaritaiyaari.backend.ai.AIUsage;
import com.sarkaritaiyaari.backend.ai.ProviderCredentialOverride;
import com.sarkaritaiyaari.backend.ai.config.AIProperties;
import com.sarkaritaiyaari.backend.ai.config.AiConfigResolver;
import com.sarkaritaiyaari.backend.ai.exception.AIAuthenticationException;
import com.sarkaritaiyaari.backend.ai.exception.AIConfigurationException;
import com.sarkaritaiyaari.backend.ai.exception.AIException;
import com.sarkaritaiyaari.backend.ai.exception.AIInvalidRequestException;
import com.sarkaritaiyaari.backend.ai.exception.AIModelNotFoundException;
import com.sarkaritaiyaari.backend.ai.exception.AIProviderUnavailableException;
import com.sarkaritaiyaari.backend.ai.exception.AIRateLimitException;
import com.sarkaritaiyaari.backend.ai.exception.AITimeoutException;
import com.sarkaritaiyaari.backend.ai.provider.AIProvider;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Anthropic's Messages API over plain REST — no SDK dependency, matching this codebase's
 * existing convention for outbound HTTP ({@code ReminderService}, the {@code ingestion}
 * package both use the JDK's own {@link HttpClient}). Never retries internally —
 * {@code AIServiceImpl} owns retry policy — and never lets a raw {@link IOException}/
 * {@link HttpTimeoutException}/Anthropic error body escape; everything is translated into an
 * {@code ai.exception} subtype before returning or throwing.
 */
@Component("claude")
public class ClaudeProvider implements AIProvider {

    private static final String DEFAULT_BASE_URL = "https://api.anthropic.com";
    private static final String ANTHROPIC_VERSION = "2023-06-01";
    private static final String DEFAULT_MODEL = "claude-sonnet-5";

    private final AIProperties properties;
    private final AiConfigResolver configResolver;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final HttpClient httpClient;

    public ClaudeProvider(AIProperties properties, AiConfigResolver configResolver) {
        this.properties = properties;
        this.configResolver = configResolver;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(Math.max(1, properties.getConnectTimeoutMs())))
                .build();
    }

    @Override
    public String id() {
        return "claude";
    }

    @Override
    public AIResponse generate(AIRequest request) {
        String apiKey = requireApiKey();
        String model = request.model() != null && !request.model().isBlank() ? request.model() : effectiveDefaultModel();

        ObjectNode body = objectMapper.createObjectNode();
        body.put("model", model);
        body.put("max_tokens", request.maxTokens() != null ? request.maxTokens() : 1024);
        if (request.systemPrompt() != null && !request.systemPrompt().isBlank()) {
            body.put("system", request.systemPrompt());
        }
        if (request.temperature() != null) {
            body.put("temperature", request.temperature());
        }
        ArrayNode messages = body.putArray("messages");
        for (AIMessage message : request.messages()) {
            ObjectNode node = messages.addObject();
            node.put("role", message.role() == AIMessage.Role.ASSISTANT ? "assistant" : "user");
            node.put("content", message.content());
        }

        long startedAt = System.currentTimeMillis();
        HttpResponse<String> response = send("/v1/messages", "POST", apiKey, baseUrl(), body.toString());
        long latencyMs = System.currentTimeMillis() - startedAt;

        JsonNode json = parse(response.body());
        if (response.statusCode() != 200) {
            throw toException(response.statusCode(), json);
        }

        String content = extractText(json.path("content"));
        JsonNode usageNode = json.path("usage");
        AIUsage usage = AIUsage.of(usageNode.path("input_tokens").asInt(0), usageNode.path("output_tokens").asInt(0));

        return new AIResponse(
                content,
                json.path("model").asText(model),
                id(),
                usage,
                json.path("stop_reason").asText(null),
                json.path("id").asText(UUID.randomUUID().toString()),
                latencyMs);
    }

    @Override
    public boolean supports(AICapability capability) {
        return capability == AICapability.TEXT_GENERATION || capability == AICapability.CHAT;
    }

    @Override
    public List<AIModelInfo> listModels() {
        return fetchModels(requireApiKey(), baseUrl());
    }

    @Override
    public AICredentialStatus validateCredentials() {
        return testCredentials(requireApiKey(), baseUrl());
    }

    @Override
    public AICredentialStatus validateCredentials(ProviderCredentialOverride override) {
        return testCredentials(override.apiKey(), override.baseUrl() != null && !override.baseUrl().isBlank() ? override.baseUrl() : DEFAULT_BASE_URL);
    }

    /* -------------------------------------------------------------------------- internals */

    private AICredentialStatus testCredentials(String apiKey, String baseUrl) {
        try {
            fetchModels(apiKey, baseUrl);
            return AICredentialStatus.ok();
        } catch (AIAuthenticationException e) {
            return AICredentialStatus.invalid(e.getMessage());
        }
        // Deliberately let every other AIException (timeout, provider-unavailable,
        // configuration) propagate — those mean "couldn't tell," not "the key is invalid."
    }

    private List<AIModelInfo> fetchModels(String apiKey, String baseUrl) {
        HttpResponse<String> response = send("/v1/models", "GET", apiKey, baseUrl, null);
        JsonNode json = parse(response.body());
        if (response.statusCode() != 200) {
            throw toException(response.statusCode(), json);
        }
        List<AIModelInfo> models = new ArrayList<>();
        for (JsonNode entry : json.path("data")) {
            String id = entry.path("id").asText();
            models.add(new AIModelInfo(id, entry.path("display_name").asText(id)));
        }
        return models;
    }

    private String requireApiKey() {
        String apiKey = configResolver.apiKeyFor(id());
        if (apiKey == null || apiKey.isBlank()) {
            throw new AIConfigurationException("No API key configured for Claude (app.ai.api-key / AI_API_KEY, or the admin AI Control Center)");
        }
        return apiKey;
    }

    private String effectiveDefaultModel() {
        String configured = configResolver.modelFor(id());
        return configured != null && !configured.isBlank() ? configured : DEFAULT_MODEL;
    }

    private String baseUrl() {
        String configured = configResolver.baseUrlFor(id());
        return configured != null && !configured.isBlank() ? configured : DEFAULT_BASE_URL;
    }

    private HttpResponse<String> send(String path, String method, String apiKey, String baseUrl, String jsonBody) {
        HttpRequest.Builder builder = HttpRequest.newBuilder(URI.create(baseUrl + path))
                .timeout(Duration.ofMillis(Math.max(1, properties.getRequestTimeoutMs())))
                .header("x-api-key", apiKey)
                .header("anthropic-version", ANTHROPIC_VERSION)
                .header("content-type", "application/json");
        builder = "POST".equals(method)
                ? builder.POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                : builder.GET();
        try {
            return httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString());
        } catch (HttpTimeoutException e) {
            throw new AITimeoutException("Claude request timed out after " + properties.getRequestTimeoutMs() + "ms", e);
        } catch (IOException e) {
            throw new AIProviderUnavailableException("Could not reach Claude: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new AIProviderUnavailableException("Claude request was interrupted", e);
        }
    }

    private JsonNode parse(String body) {
        try {
            return objectMapper.readTree(body);
        } catch (Exception e) {
            // A non-JSON body from a 5xx edge/proxy response is still "provider unavailable,"
            // not an application bug — never let a parse failure surface as a raw exception.
            throw new AIProviderUnavailableException("Claude returned a non-JSON response", e);
        }
    }

    private static String extractText(JsonNode contentArray) {
        StringBuilder sb = new StringBuilder();
        for (JsonNode block : contentArray) {
            if ("text".equals(block.path("type").asText())) {
                sb.append(block.path("text").asText());
            }
        }
        return sb.toString();
    }

    private static AIException toException(int statusCode, JsonNode json) {
        String message = json.path("error").path("message").asText("Claude request failed with HTTP " + statusCode);
        String errorType = json.path("error").path("type").asText("");
        return switch (statusCode) {
            case 401, 403 -> new AIAuthenticationException(message);
            case 404 -> new AIModelNotFoundException(message);
            case 400, 413 -> new AIInvalidRequestException(message);
            case 429 -> new AIRateLimitException(message);
            default -> {
                if ("overloaded_error".equals(errorType) || statusCode >= 500) {
                    yield new AIProviderUnavailableException(message);
                }
                yield new AIInvalidRequestException(message);
            }
        };
    }
}
