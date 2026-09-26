package com.sarkaritaiyaari.backend.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.math.BigInteger;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.security.KeyFactory;
import java.security.PublicKey;
import java.security.spec.RSAPublicKeySpec;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Fetches Google's published JWKS ({@value #JWKS_URL}) and caches it for as long as Google's own
 * {@code Cache-Control: max-age} says (usually hours). Google rotates keys; an unknown {@code kid}
 * triggers one early refresh, but no more than once a minute, so a stream of forged tokens with
 * made-up key ids cannot turn this server into a load generator against Google.
 *
 * <p>If Google cannot be reached and no keys are cached, verification fails closed: nobody signs in
 * with Google until it can be reached. Email-code sign-in is unaffected.
 */
@Component
public class HttpGoogleSigningKeys implements GoogleSigningKeys {

    private static final Logger log = LoggerFactory.getLogger(HttpGoogleSigningKeys.class);
    static final String JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
    private static final Duration DEFAULT_TTL = Duration.ofHours(1);
    private static final Duration MIN_REFRESH_GAP = Duration.ofMinutes(1);
    private static final Pattern MAX_AGE = Pattern.compile("max-age=(\\d+)");

    private final ObjectMapper json;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    private Map<String, PublicKey> cached = Map.of();
    private Instant expiresAt = Instant.EPOCH;
    private Instant lastFetch = Instant.EPOCH;

    public HttpGoogleSigningKeys(ObjectMapper json) {
        this.json = json;
    }

    @Override
    public synchronized PublicKey find(String kid) {
        Instant now = Instant.now();
        if (now.isAfter(expiresAt)) {
            refresh(now);
        }
        PublicKey key = cached.get(kid);
        if (key == null && now.isAfter(lastFetch.plus(MIN_REFRESH_GAP))) {
            // Google may have rotated since the last fetch.
            refresh(now);
            key = cached.get(kid);
        }
        return key;
    }

    private void refresh(Instant now) {
        lastFetch = now;
        try {
            HttpResponse<String> response = http.send(
                    HttpRequest.newBuilder(URI.create(JWKS_URL)).timeout(Duration.ofSeconds(10)).GET().build(),
                    HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.warn("google.jwks fetch returned {}", response.statusCode());
                return;
            }
            cached = parse(json.readTree(response.body()));
            expiresAt = now.plus(ttl(response.headers().firstValue("cache-control").orElse("")));
        } catch (Exception ex) {
            // Keep whatever was cached; an outage must not wipe keys that are still valid.
            log.warn("google.jwks fetch failed: {}", ex.getMessage());
        }
    }

    static Map<String, PublicKey> parse(JsonNode jwks) throws Exception {
        Map<String, PublicKey> keys = new HashMap<>();
        KeyFactory rsa = KeyFactory.getInstance("RSA");
        for (JsonNode jwk : jwks.path("keys")) {
            if (!"RSA".equals(jwk.path("kty").asText())) continue;
            BigInteger n = new BigInteger(1, Base64.getUrlDecoder().decode(jwk.path("n").asText()));
            BigInteger e = new BigInteger(1, Base64.getUrlDecoder().decode(jwk.path("e").asText()));
            keys.put(jwk.path("kid").asText(), rsa.generatePublic(new RSAPublicKeySpec(n, e)));
        }
        return Map.copyOf(keys);
    }

    private static Duration ttl(String cacheControl) {
        Matcher m = MAX_AGE.matcher(cacheControl);
        return m.find() ? Duration.ofSeconds(Long.parseLong(m.group(1))) : DEFAULT_TTL;
    }
}
