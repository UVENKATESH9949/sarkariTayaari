package com.sarkaritaiyaari.backend.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.Signature;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Test fixture that stands in for Google: replaces {@link HttpGoogleSigningKeys} in every test run
 * via {@code @Primary} (same precedent as FakeDocumentStorage), and can mint ID tokens signed with
 * its own RSA key exactly the way Google signs them. Never on the production classpath.
 */
@Component
@Primary
public class FixtureGoogleSigningKeys implements GoogleSigningKeys {

    public static final String KID = "fixture-kid";
    private static final KeyPair GOOGLE_LIKE = generate();
    private static final KeyPair SOMEONE_ELSE = generate();
    private static final ObjectMapper JSON = new ObjectMapper();

    @Override
    public PublicKey find(String kid) {
        return KID.equals(kid) ? GOOGLE_LIKE.getPublic() : null;
    }

    /** Claims a real Google token for {@code aud} would carry, valid for an hour from now. */
    public static Map<String, Object> validClaims(String email, String aud) {
        long now = System.currentTimeMillis() / 1000;
        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put("iss", "https://accounts.google.com");
        claims.put("aud", aud);
        claims.put("sub", "10987654321");
        claims.put("email", email);
        claims.put("email_verified", true);
        claims.put("name", "Test Student");
        claims.put("iat", now);
        claims.put("exp", now + 3600);
        return claims;
    }

    public static String mint(Map<String, Object> claims) {
        return sign(claims, KID, GOOGLE_LIKE.getPrivate(), "RS256");
    }

    /** Signed with a key Google never published — a forgery. */
    public static String mintForged(Map<String, Object> claims) {
        return sign(claims, KID, SOMEONE_ELSE.getPrivate(), "RS256");
    }

    public static String mintWith(Map<String, Object> claims, String kid, String alg) {
        return sign(claims, kid, GOOGLE_LIKE.getPrivate(), alg);
    }

    private static String sign(Map<String, Object> claims, String kid, PrivateKey key, String alg) {
        try {
            Base64.Encoder b64 = Base64.getUrlEncoder().withoutPadding();
            String header = b64.encodeToString(JSON.writeValueAsBytes(Map.of("alg", alg, "kid", kid, "typ", "JWT")));
            String payload = b64.encodeToString(JSON.writeValueAsBytes(claims));
            Signature signer = Signature.getInstance("SHA256withRSA");
            signer.initSign(key);
            signer.update((header + "." + payload).getBytes(StandardCharsets.US_ASCII));
            return header + "." + payload + "." + b64.encodeToString(signer.sign());
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static KeyPair generate() {
        try {
            KeyPairGenerator gen = KeyPairGenerator.getInstance("RSA");
            gen.initialize(2048);
            return gen.generateKeyPair();
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }
}
