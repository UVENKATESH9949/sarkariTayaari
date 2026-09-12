package com.sarkaritaiyaari.backend.ai.provider.mock;

import com.sarkaritaiyaari.backend.ai.AICapability;
import com.sarkaritaiyaari.backend.ai.AICredentialStatus;
import com.sarkaritaiyaari.backend.ai.AIMessage;
import com.sarkaritaiyaari.backend.ai.AIModelInfo;
import com.sarkaritaiyaari.backend.ai.AIRequest;
import com.sarkaritaiyaari.backend.ai.AIResponse;
import com.sarkaritaiyaari.backend.ai.AIUsage;
import com.sarkaritaiyaari.backend.ai.provider.AIProvider;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * Deterministic, zero-network provider — the default {@code app.ai.provider} value, so a
 * fresh checkout with no API key configured can still exercise the whole {@code AIService}
 * path (retry plumbing, usage recording, error normalization) in tests and local dev.
 * Real-world features must never rely on this for an actual answer.
 */
@Component("mock")
public class MockAIProvider implements AIProvider {

    public static final String MODEL_ID = "mock-echo-1";

    @Override
    public String id() {
        return "mock";
    }

    @Override
    public AIResponse generate(AIRequest request) {
        String lastUserMessage = request.messages().stream()
                .filter(m -> m.role() == AIMessage.Role.USER)
                .reduce((first, second) -> second)
                .map(AIMessage::content)
                .orElse("");

        String content = "[mock response] " + lastUserMessage;
        int inputTokens = estimateTokens(request.systemPrompt())
                + request.messages().stream().mapToInt(m -> estimateTokens(m.content())).sum();
        int outputTokens = estimateTokens(content);

        return new AIResponse(
                content,
                request.model() != null && !request.model().isBlank() ? request.model() : MODEL_ID,
                id(),
                AIUsage.of(inputTokens, outputTokens),
                "stop",
                UUID.randomUUID().toString(),
                0L);
    }

    @Override
    public boolean supports(AICapability capability) {
        return capability == AICapability.TEXT_GENERATION
                || capability == AICapability.CHAT
                || capability == AICapability.STRUCTURED_OUTPUT;
    }

    @Override
    public List<AIModelInfo> listModels() {
        return List.of(new AIModelInfo(MODEL_ID, "Mock Echo (deterministic, no network)"));
    }

    @Override
    public AICredentialStatus validateCredentials() {
        return AICredentialStatus.ok();
    }

    private static int estimateTokens(String text) {
        if (text == null || text.isBlank()) return 0;
        // Rough, provider-agnostic estimate (~4 chars/token) — good enough for a
        // deterministic mock; a real provider reports its own real usage instead.
        return Math.max(1, text.length() / 4);
    }
}
