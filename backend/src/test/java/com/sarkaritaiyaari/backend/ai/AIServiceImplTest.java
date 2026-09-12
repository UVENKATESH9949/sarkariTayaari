package com.sarkaritaiyaari.backend.ai;

import com.sarkaritaiyaari.backend.ai.config.AIProperties;
import com.sarkaritaiyaari.backend.ai.config.AiConfigResolver;
import com.sarkaritaiyaari.backend.ai.config.DynamicAiConfigSource;
import com.sarkaritaiyaari.backend.ai.config.ProviderCredential;
import com.sarkaritaiyaari.backend.ai.exception.AIAuthenticationException;
import com.sarkaritaiyaari.backend.ai.exception.AIConfigurationException;
import com.sarkaritaiyaari.backend.ai.exception.AIInvalidRequestException;
import com.sarkaritaiyaari.backend.ai.exception.AIProviderUnavailableException;
import com.sarkaritaiyaari.backend.ai.provider.AIProvider;
import com.sarkaritaiyaari.backend.ai.provider.AIProviderRegistry;
import com.sarkaritaiyaari.backend.ai.provider.mock.MockAIProvider;
import com.sarkaritaiyaari.backend.ai.usage.AIUsageEvent;
import com.sarkaritaiyaari.backend.ai.usage.AIUsageRecorder;
import org.junit.jupiter.api.Test;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Supplier;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Plain JUnit, no Spring context and no database — matches this codebase's existing
 * precedent for pure-logic services ({@code TopicHealthScoringTest},
 * {@code QuestionEvaluatorsTest}). {@code AIServiceImpl}'s retry/timeout/usage-recording
 * logic is arithmetic and control flow, not anything that needs a running application.
 */
class AIServiceImplTest {

    @Test
    void generate_successfulCall_returnsResponseAndRecordsUsage() {
        RecordingUsageRecorder usage = new RecordingUsageRecorder();
        AIServiceImpl service = serviceWith(properties("mock", true, 2), Map.of("mock", new MockAIProvider()), usage);

        AIRequest request = AIRequest.builder()
                .messages(List.of(AIMessage.user("hello")))
                .metadata(Map.of("feature", "unit-test"))
                .build();

        AIResponse response = service.generate(request);

        assertTrue(response.content().contains("hello"));
        assertEquals(1, usage.events.size());
        assertEquals("success", usage.events.get(0).status());
        assertEquals("unit-test", usage.events.get(0).feature());
    }

    @Test
    void generate_transientFailureThenSuccess_retriesAndSucceeds() {
        ScriptedProvider provider = new ScriptedProvider(List.of(
                () -> {
                    throw new AIProviderUnavailableException("temporarily down");
                },
                () -> sampleResponse("second attempt")));
        AIServiceImpl service = serviceWith(properties("scripted", true, 2), Map.of("scripted", provider), new RecordingUsageRecorder());

        AIResponse response = service.generate(sampleRequest());

        assertEquals("second attempt", response.content());
        assertEquals(2, provider.calls);
    }

    @Test
    void generate_authenticationFailure_doesNotRetry() {
        ScriptedProvider provider = new ScriptedProvider(List.of(
                () -> {
                    throw new AIAuthenticationException("bad key");
                },
                () -> {
                    throw new AIAuthenticationException("bad key");
                }));
        AIServiceImpl service = serviceWith(properties("scripted", true, 2), Map.of("scripted", provider), new RecordingUsageRecorder());

        assertThrows(AIAuthenticationException.class, () -> service.generate(sampleRequest()));
        assertEquals(1, provider.calls);
    }

    @Test
    void generate_retriesExhausted_throwsLastErrorAfterConfiguredAttempts() {
        ScriptedProvider provider = new ScriptedProvider(List.of(
                () -> {
                    throw new AIProviderUnavailableException("down");
                },
                () -> {
                    throw new AIProviderUnavailableException("down");
                }));
        RecordingUsageRecorder usage = new RecordingUsageRecorder();
        AIServiceImpl service = serviceWith(properties("scripted", true, 1), Map.of("scripted", provider), usage);

        assertThrows(AIProviderUnavailableException.class, () -> service.generate(sampleRequest()));
        assertEquals(2, provider.calls); // 1 initial attempt + 1 retry (maxRetries=1)
        assertEquals("error", usage.events.get(0).status());
    }

    @Test
    void generate_disabledByConfig_throwsConfigurationExceptionWithoutCallingProvider() {
        ScriptedProvider provider = new ScriptedProvider(List.of());
        AIServiceImpl service = serviceWith(properties("scripted", false, 2), Map.of("scripted", provider), new RecordingUsageRecorder());

        assertThrows(AIConfigurationException.class, () -> service.generate(sampleRequest()));
        assertEquals(0, provider.calls);
    }

    @Test
    void generate_emptyMessages_throwsInvalidRequest() {
        AIServiceImpl service = serviceWith(properties("mock", true, 2), Map.of("mock", new MockAIProvider()), new RecordingUsageRecorder());

        AIRequest request = AIRequest.builder().messages(List.of()).build();

        assertThrows(AIInvalidRequestException.class, () -> service.generate(request));
    }

    /* -------------------------------------------------------------------------- helpers */

    private static AIServiceImpl serviceWith(AIProperties properties, Map<String, AIProvider> providers, AIUsageRecorder usage) {
        AiConfigResolver configResolver = new AiConfigResolver(properties, new StaticOnlyConfigSource());
        return new AIServiceImpl(new AIProviderRegistry(providers, configResolver), properties, configResolver, usage);
    }

    private static AIProperties properties(String provider, boolean enabled, int maxRetries) {
        return new AIProperties(enabled, provider, "", "", "", 1000, 1000, maxRetries);
    }

    /** No admin override exists — every AIProviderRegistry/AIServiceImpl decision in this
     * test class comes purely from the static AIProperties passed in, exactly like before
     * the AI Admin Control Center existed. */
    private static final class StaticOnlyConfigSource implements DynamicAiConfigSource {
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
    }

    private static AIRequest sampleRequest() {
        return AIRequest.builder().messages(List.of(AIMessage.user("hi"))).build();
    }

    private static AIResponse sampleResponse(String content) {
        return new AIResponse(content, "test-model", "scripted", AIUsage.of(1, 1), "stop", "req-1", 0L);
    }

    private static final class ScriptedProvider implements AIProvider {
        private final Deque<Supplier<AIResponse>> script;
        int calls = 0;

        ScriptedProvider(List<Supplier<AIResponse>> script) {
            this.script = new ArrayDeque<>(script);
        }

        @Override
        public String id() {
            return "scripted";
        }

        @Override
        public AIResponse generate(AIRequest request) {
            calls++;
            return script.poll().get();
        }

        @Override
        public boolean supports(AICapability capability) {
            return capability == AICapability.TEXT_GENERATION;
        }

        @Override
        public List<AIModelInfo> listModels() {
            return List.of();
        }

        @Override
        public AICredentialStatus validateCredentials() {
            return AICredentialStatus.ok();
        }
    }

    private static final class RecordingUsageRecorder implements AIUsageRecorder {
        final List<AIUsageEvent> events = new ArrayList<>();

        @Override
        public void record(AIUsageEvent event) {
            events.add(event);
        }
    }
}
