package com.sarkaritaiyaari.backend.ai.provider.claude;

import com.sarkaritaiyaari.backend.ai.AIMessage;
import com.sarkaritaiyaari.backend.ai.AIModelInfo;
import com.sarkaritaiyaari.backend.ai.AIRequest;
import com.sarkaritaiyaari.backend.ai.AIResponse;
import com.sarkaritaiyaari.backend.ai.config.AIProperties;
import com.sarkaritaiyaari.backend.ai.config.AiConfigResolver;
import com.sarkaritaiyaari.backend.ai.config.DynamicAiConfigSource;
import com.sarkaritaiyaari.backend.ai.config.ProviderCredential;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import java.util.List;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Real network call to the real Anthropic API — never runs as part of an ordinary
 * {@code mvn test}. This project's own convention is "real provider integration tests
 * explicitly separated and disabled by default" (the same stance the backend suite already
 * takes toward anything hitting a real external system/database — see
 * {@code system-design/05-why-its-built-this-way.md}'s "why backend tests are off by
 * default"). Run manually, with a real key, from the backend module directory:
 *
 * <pre>
 *   AI_REAL_PROVIDER_TESTS=true AI_API_KEY=sk-ant-... \
 *     mvn -f backend/pom.xml test -Dtest=ClaudeProviderRealApiTest
 * </pre>
 *
 * With no env var set (the default), every test here is skipped — not failed — by
 * {@code @EnabledIfEnvironmentVariable}.
 */
@EnabledIfEnvironmentVariable(named = "AI_REAL_PROVIDER_TESTS", matches = "true")
class ClaudeProviderRealApiTest {

    @Test
    void generate_realCall_returnsRealAnthropicResponse() {
        ClaudeProvider provider = new ClaudeProvider(propertiesFromEnv(), resolverFromEnv());

        AIResponse response = provider.generate(AIRequest.builder()
                .maxTokens(32)
                .messages(List.of(AIMessage.user("Reply with exactly the word: pong")))
                .build());

        assertTrue(response.content().toLowerCase().contains("pong"));
        assertTrue(response.usage().totalTokens() > 0);
    }

    @Test
    void listModels_realCall_returnsAtLeastOneModel() {
        ClaudeProvider provider = new ClaudeProvider(propertiesFromEnv(), resolverFromEnv());

        List<AIModelInfo> models = provider.listModels();

        assertFalse(models.isEmpty());
    }

    private static AIProperties propertiesFromEnv() {
        String apiKey = System.getenv("AI_API_KEY");
        return new AIProperties(true, "claude", apiKey, "", "", 10_000, 60_000, 0);
    }

    private static AiConfigResolver resolverFromEnv() {
        return new AiConfigResolver(propertiesFromEnv(), new DynamicAiConfigSource() {
            @Override
            public Optional<Boolean> enabledOverride() {
                return Optional.empty();
            }

            @Override
            public Optional<String> activeProviderOverride() {
                return Optional.empty();
            }

            @Override
            public Optional<ProviderCredential> credentialOverride(String providerId) {
                return Optional.empty();
            }
        });
    }
}
