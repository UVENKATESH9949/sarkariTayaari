package com.sarkaritaiyaari.backend.ai.config;

import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Plain JUnit, no Spring, no database — the resolver's job is pure precedence logic
 * (DB override wins when present, static {@link AIProperties} is the fallback — but only for
 * the one provider the static config actually names, see the last two tests below). */
class AiConfigResolverTest {

    @Test
    void noOverride_fallsBackToStaticProperties() {
        AIProperties properties = new AIProperties(false, "MOCK", "static-key", "static-model", "https://static.example", 1000, 1000, 0);
        AiConfigResolver resolver = new AiConfigResolver(properties, new FakeSource(Optional.empty(), Optional.empty(), Optional.empty()));

        assertFalse(resolver.isEnabled());
        assertEquals("MOCK", resolver.activeProvider());
        // Queried by the same id the static config actually names (case-insensitively) —
        // this is the one provider app.ai.* is genuinely configuring.
        assertEquals("static-key", resolver.apiKeyFor("mock"));
        assertEquals("static-model", resolver.modelFor("mock"));
        assertEquals("https://static.example", resolver.baseUrlFor("mock"));
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
        // Static config genuinely names "claude" here, so its fields are a legitimate fallback
        // for a claude query with a partially-blank DB row.
        AIProperties properties = new AIProperties(true, "CLAUDE", "static-key", "static-model", "", 1000, 1000, 0);
        ProviderCredential partialCredential = new ProviderCredential("", "db-model", null);
        AiConfigResolver resolver = new AiConfigResolver(properties,
                new FakeSource(Optional.empty(), Optional.empty(), Optional.of(partialCredential)));

        assertEquals("static-key", resolver.apiKeyFor("claude"));
        assertEquals("db-model", resolver.modelFor("claude"));
        assertEquals("", resolver.baseUrlFor("claude"));
    }

    @Test
    void staticConfigDoesNotLeakToADifferentProvider() {
        // A real bug, found by running AiConfigurationTest against a real Groq key: with two
        // real HTTP-calling providers registered (claude, groq) and app.ai.* naming only one of
        // them, a query for the OTHER provider's credentials must not silently inherit this
        // one's key/model/base-url just because no DB row exists for it either. Before the fix,
        // this returned "static-key" for "groq" too, purely because no provider-id check existed.
        AIProperties properties = new AIProperties(true, "CLAUDE", "static-key", "static-model", "https://static.example", 1000, 1000, 0);
        AiConfigResolver resolver = new AiConfigResolver(properties, new FakeSource(Optional.empty(), Optional.empty(), Optional.empty()));

        assertNull(resolver.apiKeyFor("groq"));
        assertNull(resolver.modelFor("groq"));
        assertNull(resolver.baseUrlFor("groq"));
        // The provider it actually names is unaffected.
        assertEquals("static-key", resolver.apiKeyFor("claude"));
    }

    @Test
    void staticProviderMatchIsCaseInsensitive() {
        AIProperties properties = new AIProperties(true, "GROQ", "static-key", null, null, 1000, 1000, 0);
        AiConfigResolver resolver = new AiConfigResolver(properties, new FakeSource(Optional.empty(), Optional.empty(), Optional.empty()));

        assertEquals("static-key", resolver.apiKeyFor("groq"));
        assertNull(resolver.apiKeyFor("claude"));
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
