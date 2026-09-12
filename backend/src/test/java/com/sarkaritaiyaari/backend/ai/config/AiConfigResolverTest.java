package com.sarkaritaiyaari.backend.ai.config;

import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Plain JUnit, no Spring, no database — the resolver's job is pure precedence logic
 * (DB override wins when present, static {@link AIProperties} is the fallback). */
class AiConfigResolverTest {

    @Test
    void noOverride_fallsBackToStaticProperties() {
        AIProperties properties = new AIProperties(false, "MOCK", "static-key", "static-model", "https://static.example", 1000, 1000, 0);
        AiConfigResolver resolver = new AiConfigResolver(properties, new FakeSource(Optional.empty(), Optional.empty(), Optional.empty()));

        assertFalse(resolver.isEnabled());
        assertEquals("MOCK", resolver.activeProvider());
        assertEquals("static-key", resolver.apiKeyFor("claude"));
        assertEquals("static-model", resolver.modelFor("claude"));
        assertEquals("https://static.example", resolver.baseUrlFor("claude"));
    }

    @Test
    void dbOverride_winsOverStaticProperties() {
        AIProperties properties = new AIProperties(false, "MOCK", "static-key", "static-model", "https://static.example", 1000, 1000, 0);
        ProviderCredential dbCredential = new ProviderCredential("db-key", "db-model", "https://db.example");
        AiConfigResolver resolver = new AiConfigResolver(properties,
                new FakeSource(Optional.of(true), Optional.of("claude"), Optional.of(dbCredential)));

        assertTrue(resolver.isEnabled());
        assertEquals("claude", resolver.activeProvider());
        assertEquals("db-key", resolver.apiKeyFor("claude"));
        assertEquals("db-model", resolver.modelFor("claude"));
        assertEquals("https://db.example", resolver.baseUrlFor("claude"));
    }

    @Test
    void dbRowPresentButBlankField_fallsBackToStaticForThatFieldOnly() {
        AIProperties properties = new AIProperties(true, "MOCK", "static-key", "static-model", "", 1000, 1000, 0);
        ProviderCredential partialCredential = new ProviderCredential("", "db-model", null);
        AiConfigResolver resolver = new AiConfigResolver(properties,
                new FakeSource(Optional.empty(), Optional.empty(), Optional.of(partialCredential)));

        assertEquals("static-key", resolver.apiKeyFor("claude"));
        assertEquals("db-model", resolver.modelFor("claude"));
        assertEquals("", resolver.baseUrlFor("claude"));
    }

    private record FakeSource(Optional<Boolean> enabled, Optional<String> provider,
                               Optional<ProviderCredential> credential) implements DynamicAiConfigSource {
        @Override
        public Optional<Boolean> enabledOverride() {
            return enabled;
        }

        @Override
        public Optional<String> activeProviderOverride() {
            return provider;
        }

        @Override
        public Optional<ProviderCredential> credentialOverride(String providerId) {
            return credential;
        }
    }
}
