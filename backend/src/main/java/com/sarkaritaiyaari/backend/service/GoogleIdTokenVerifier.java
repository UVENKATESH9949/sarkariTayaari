package com.sarkaritaiyaari.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.PublicKey;
import java.security.Signature;
import java.time.Clock;
import java.util.Base64;
import java.util.Set;

/**
 * Proves a Google ID token is genuine and meant for this app, using only the JDK (2026-09-25).
 *
 * <h2>Why hand-rolled rather than google-api-client</h2>
 * The check is small and fully specified by Google (OpenID Connect), and this project already chose
 * hand-rolled auth over a heavy dependency (ADR-003). Verifying an RS256 JWT is ~one signature call.
 * Every rule below is one Google documents for validating an ID token on a backend.
 *
 * <h2>What a token must satisfy — every one, or it is rejected</h2>
 * <ol>
 *   <li>Three dot-separated parts, header {@code alg} RS256, with a {@code kid} Google publishes.</li>
 *   <li>A valid RSA-SHA256 signature by that key over {@code header.payload}.</li>
 *   <li>{@code iss} is {@code accounts.google.com} or {@code https://accounts.google.com}.</li>
 *   <li>{@code aud} is THIS app's web client id — otherwise a token minted for some other app, by
 *       anyone, would sign in here.</li>
 *   <li>{@code exp} is in the future (60 s of clock skew allowed).</li>
 *   <li>{@code email_verified} is true. Account linking is by email, so an unverified address would
 *       let someone take over the account that address belongs to.</li>
 * </ol>
 * Every failure is the same {@link UnauthorizedException} message; the reason is logged, not
 * returned, so the endpoint does not coach anyone forging tokens.
 */
@Component
public class GoogleIdTokenVerifier {

    private static final Logger log = LoggerFactory.getLogger(GoogleIdTokenVerifier.class);
    private static final Set<String> ISSUERS = Set.of("accounts.google.com", "https://accounts.google.com");
    private static final long CLOCK_SKEW_SECONDS = 60;
    static final String REJECTED = "Google sign-in could not be verified. Please try again.";

    private final GoogleSigningKeys keys;
    private final ObjectMapper json;
    private final String webClientId;
    private final Clock clock;

    // Explicit because the class has a second (test) constructor; without this Spring cannot choose
    // and the whole application fails to start - which is how this was found.
    @Autowired
    public GoogleIdTokenVerifier(GoogleSigningKeys keys,
                                 ObjectMapper json,
                                 @Value("${app.auth.google.web-client-id:}") String webClientId) {
        this(keys, json, webClientId, Clock.systemUTC());
    }

    GoogleIdTokenVerifier(GoogleSigningKeys keys, ObjectMapper json, String webClientId, Clock clock) {
        this.keys = keys;
        this.json = json;
        this.webClientId = webClientId == null ? "" : webClientId.trim();
        this.clock = clock;
    }

    /** False when no web client id is configured — Google sign-in is then switched off. */
    public boolean isConfigured() {
        return !webClientId.isEmpty();
    }

    public GoogleIdentity verify(String idToken) {
        if (idToken == null || idToken.isBlank()) {
            throw reject("empty token");
        }
        String[] parts = idToken.trim().split("\\.");
        if (parts.length != 3) {
            throw reject("not a three-part JWT");
        }

        JsonNode header = decode(parts[0], "header");
        if (!"RS256".equals(header.path("alg").asText())) {
            throw reject("alg is not RS256: " + header.path("alg").asText());
        }
        String kid = header.path("kid").asText("");
        PublicKey key = keys.find(kid);
        if (key == null) {
            throw reject("unknown kid " + kid);
        }
        if (!signatureMatches(key, parts)) {
            throw reject("bad signature");
        }

        JsonNode claims = decode(parts[1], "payload");
        String iss = claims.path("iss").asText("");
        if (!ISSUERS.contains(iss)) {
            throw reject("issuer " + iss);
        }
        if (!audienceMatches(claims.path("aud"))) {
            throw reject("audience is not this app");
        }
        long now = clock.instant().getEpochSecond();
        long exp = claims.path("exp").asLong(0);
        if (exp == 0 || exp + CLOCK_SKEW_SECONDS < now) {
            throw reject("expired");
        }
        String email = claims.path("email").asText("");
        if (email.isBlank()) {
            throw reject("no email claim");
        }
        // Google sends a boolean; older tokens have been seen with the string "true".
        JsonNode verified = claims.path("email_verified");
        boolean emailVerified = verified.isBoolean() ? verified.asBoolean() : "true".equals(verified.asText());
        if (!emailVerified) {
            throw reject("email not verified");
        }

        return new GoogleIdentity(claims.path("sub").asText(""), email,
                claims.hasNonNull("name") ? claims.path("name").asText() : null);
    }

    private boolean audienceMatches(JsonNode aud) {
        if (!isConfigured()) {
            return false;
        }
        if (aud.isArray()) {
            for (JsonNode one : aud) {
                if (webClientId.equals(one.asText())) return true;
            }
            return false;
        }
        return webClientId.equals(aud.asText());
    }

    private static boolean signatureMatches(PublicKey key, String[] parts) {
        try {
            Signature verifier = Signature.getInstance("SHA256withRSA");
            verifier.initVerify(key);
            verifier.update((parts[0] + "." + parts[1]).getBytes(StandardCharsets.US_ASCII));
            return verifier.verify(Base64.getUrlDecoder().decode(parts[2]));
        } catch (Exception ex) {
            return false;
        }
    }

    private JsonNode decode(String segment, String what) {
        try {
            return json.readTree(Base64.getUrlDecoder().decode(segment));
        } catch (Exception ex) {
            throw reject("unreadable " + what);
        }
    }

    private static UnauthorizedException reject(String reason) {
        log.warn("google.signin rejected: {}", reason);
        return new UnauthorizedException(REJECTED);
    }

    /** @param subject Google's stable account id, never reused */
    public record GoogleIdentity(String subject, String email, String name) {
    }
}
