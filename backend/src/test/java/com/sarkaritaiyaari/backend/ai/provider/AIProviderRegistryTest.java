package com.sarkaritaiyaari.backend.ai.provider;

import com.sarkaritaiyaari.backend.ai.config.AIProperties;
import com.sarkaritaiyaari.backend.ai.config.AiConfigResolver;
import com.sarkaritaiyaari.backend.ai.config.DynamicAiConfigSource;
import com.sarkaritaiyaari.backend.ai.config.ProviderCredential;
import com.sarkaritaiyaari.backend.ai.exception.AIUnknownProviderException;
import com.sarkaritaiyaari.backend.ai.provider.mock.MockAIProvider;
import org.junit.jupiter.api.Test;

import java.util.Map;
import java.util.Optional;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Plain JUnit — provider selection is a pure lookup, no Spring context needed. */
class AIProviderRegistryTest {

    @Test
    void active_resolvesConfiguredProviderCaseInsensitively() {
        MockAIProvider mock = new MockAIProvider();
        AIProviderRegistry registry = registryWith(Map.of("mock", mock), "Mock");

        assertEquals(mock, registry.active());
        assertEquals(mock, registry.resolve("MOCK"));
    }

    @Test
    void resolve_unimplementedProvider_throwsUnknownProvider() {
        AIProviderRegistry registry = registryWith(Map.of("mock", new MockAIProvider()), "OPENAI");

        assertThrows(AIUnknownProviderException.class, registry::active);
        assertThrows(AIUnknownProviderException.class, () -> registry.resolve("openai"));
    }

    @Test
    void resolve_blankProviderId_throwsUnknownProvider() {
        AIProviderRegistry registry = registryWith(Map.of("mock", new MockAIProvider()), "");

        assertThrows(AIUnknownProviderException.class, registry::active);
    }

    @Test
    void registeredProviderIds_returnsExactlyTheRegisteredBeanNames() {
        AIProviderRegistry registry = registryWith(Map.of("mock", new MockAIProvider()), "mock");

        Set<String> ids = registry.registeredProviderIds();

        assertEquals(Set.of("mock"), ids);
        assertTrue(!ids.contains("openai") && !ids.contains("gemini"), "unregistered providers must never appear");
    }

    private static AIProviderRegistry registryWith(Map<String, AIProvider> providers, String staticProviderId) {
        AIProperties properties = new AIProperties(true, staticProviderId, "", "", "", 1000, 1000, 0);
        AiConfigResolver resolver = new AiConfigResolver(properties, new NoOverrideConfigSource());
        return new AIProviderRegistry(providers, resolver);
    }

    private static final class NoOverrideConfigSource implements DynamicAiConfigSource {
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
}
