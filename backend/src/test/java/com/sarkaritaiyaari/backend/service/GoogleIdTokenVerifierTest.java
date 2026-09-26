package com.sarkaritaiyaari.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Every rule Google documents for validating an ID token, each proven to reject on its own. Plain
 * JUnit, no Spring, no network: the fixture plays Google's part with its own RSA key.
 */
class GoogleIdTokenVerifierTest {

    private static final String CLIENT_ID = "test-web-client.apps.googleusercontent.com";
    private final GoogleIdTokenVerifier verifier =
            new GoogleIdTokenVerifier(new FixtureGoogleSigningKeys(), new ObjectMapper(), CLIENT_ID);

    private Map<String, Object> claims() {
        return FixtureGoogleSigningKeys.validClaims("student@gmail.com", CLIENT_ID);
    }

    @Test
    void aGenuineTokenForThisAppIsAccepted() {
        GoogleIdTokenVerifier.GoogleIdentity identity = verifier.verify(FixtureGoogleSigningKeys.mint(claims()));
        assertThat(identity.email()).isEqualTo("student@gmail.com");
        assertThat(identity.subject()).isEqualTo("10987654321");
    }

    @Test
    void bothIssuerSpellingsAreAcceptedAndNoOther() {
        Map<String, Object> c = claims();
        c.put("iss", "accounts.google.com");
        assertThat(verifier.verify(FixtureGoogleSigningKeys.mint(c)).email()).isEqualTo("student@gmail.com");

        c.put("iss", "https://evil.example.com");
        assertRejected(FixtureGoogleSigningKeys.mint(c));
    }

    @Test
    void aTokenForAnotherAppIsRejected() {
        Map<String, Object> c = claims();
        c.put("aud", "someone-elses-app.apps.googleusercontent.com");
        assertRejected(FixtureGoogleSigningKeys.mint(c));
    }

    @Test
    void anAudienceListContainingThisAppIsAccepted() {
        Map<String, Object> c = claims();
        c.put("aud", List.of("other.apps.googleusercontent.com", CLIENT_ID));
        assertThat(verifier.verify(FixtureGoogleSigningKeys.mint(c)).email()).isEqualTo("student@gmail.com");
    }

    @Test
    void anExpiredTokenIsRejected() {
        Map<String, Object> c = claims();
        c.put("exp", System.currentTimeMillis() / 1000 - 120);
        assertRejected(FixtureGoogleSigningKeys.mint(c));
    }

    @Test
    void anUnverifiedEmailIsRejected() {
        Map<String, Object> c = claims();
        c.put("email_verified", false);
        assertRejected(FixtureGoogleSigningKeys.mint(c));
    }

    @Test
    void aForgedSignatureIsRejected() {
        assertRejected(FixtureGoogleSigningKeys.mintForged(claims()));
    }

    @Test
    void anEditedPayloadBreaksTheSignature() {
        String genuine = FixtureGoogleSigningKeys.mint(claims());
        String[] parts = genuine.split("\\.");
        Map<String, Object> c = claims();
        c.put("email", "victim@gmail.com");
        String otherPayload = FixtureGoogleSigningKeys.mint(c).split("\\.")[1];
        assertRejected(parts[0] + "." + otherPayload + "." + parts[2]);
    }

    @Test
    void anUnknownKeyIdOrANonRsaAlgorithmIsRejected() {
        assertRejected(FixtureGoogleSigningKeys.mintWith(claims(), "not-a-google-kid", "RS256"));
        assertRejected(FixtureGoogleSigningKeys.mintWith(claims(), FixtureGoogleSigningKeys.KID, "none"));
    }

    @Test
    void garbageIsRejected() {
        assertRejected("");
        assertRejected("not.a.jwt.at.all");
        assertRejected("aaa.bbb.ccc");
    }

    @Test
    void withNoClientIdConfiguredNothingIsAccepted() {
        GoogleIdTokenVerifier off = new GoogleIdTokenVerifier(new FixtureGoogleSigningKeys(), new ObjectMapper(), "");
        assertThat(off.isConfigured()).isFalse();
        assertThatThrownBy(() -> off.verify(FixtureGoogleSigningKeys.mint(claims())))
                .isInstanceOf(UnauthorizedException.class);
    }

    private void assertRejected(String token) {
        assertThatThrownBy(() -> verifier.verify(token))
                .isInstanceOf(UnauthorizedException.class)
                .hasMessage(GoogleIdTokenVerifier.REJECTED);
    }
}
