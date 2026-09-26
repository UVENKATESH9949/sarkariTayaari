package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.entity.EmailOtpCode;
import com.sarkaritaiyaari.backend.repository.EmailOtpCodeRepository;
import com.sarkaritaiyaari.backend.service.FixtureGoogleSigningKeys;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * POST /api/auth/google end to end, with FixtureGoogleSigningKeys standing in for Google.
 *
 * <p>The decisive case is account linking: a Gmail that first signed in with an emailed code and
 * then with Google must land in the SAME account — one user id, not two.
 */
class GoogleSignInTest extends AbstractIntegrationTest {

    @Autowired private EmailOtpCodeRepository codeRepository;
    @Autowired private JdbcTemplate jdbc;
    @Value("${app.auth.google.web-client-id}") private String clientId;

    private final String runId = UUID.randomUUID().toString().substring(0, 8);
    private final List<String> emails = new ArrayList<>();

    @AfterEach
    void cleanUp() {
        for (String email : emails) {
            jdbc.update("DELETE FROM email_otp_codes WHERE email = ?", email);
            userRepository.findByEmail(email).ifPresent(userRepository::delete);
        }
    }

    private String address(String tag) {
        String email = "sarkaritaiyaari.autotest.g" + tag + "." + runId + "@gmail.com";
        emails.add(email);
        return email;
    }

    @Test
    void aFirstGoogleSignInCreatesTheAccountAndReturnsASession() {
        String email = address("new");
        ResponseEntity<Map> response = google(FixtureGoogleSigningKeys.mint(FixtureGoogleSigningKeys.validClaims(email, clientId)));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().get("token")).isNotNull();
        assertThat(((Map<?, ?>) response.getBody().get("user")).get("email")).isEqualTo(email);
        assertThat(userRepository.findByEmail(email)).isPresent();
    }

    @Test
    void anEmailCodeAccountAndAGoogleSignInForTheSameGmailAreOneAccount() {
        String email = address("link");
        EmailOtpCode row = new EmailOtpCode();
        row.setEmail(email);
        row.setCodeHash(new BCryptPasswordEncoder().encode("123456"));
        row.setExpiresAt(OffsetDateTime.now().plusMinutes(10));
        codeRepository.saveAndFlush(row);
        ResponseEntity<Map> byCode = restTemplate.postForEntity("/api/auth/otp/verify",
                Map.of("email", email, "code", "123456"), Map.class);
        Object codeUserId = ((Map<?, ?>) byCode.getBody().get("user")).get("id");

        // Google reports the address with different case; it must still be the same account.
        ResponseEntity<Map> byGoogle = google(FixtureGoogleSigningKeys.mint(
                FixtureGoogleSigningKeys.validClaims(email.toUpperCase(), clientId)));

        assertThat(byGoogle.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(((Map<?, ?>) byGoogle.getBody().get("user")).get("id")).isEqualTo(codeUserId);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM users WHERE lower(email) = ?", Long.class, email))
                .isEqualTo(1L);
    }

    @Test
    void aNonGmailGoogleAccountIsRefused() {
        String email = "someone." + runId + "@example.com";
        emails.add(email);
        ResponseEntity<Map> response = google(FixtureGoogleSigningKeys.mint(FixtureGoogleSigningKeys.validClaims(email, clientId)));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(userRepository.findByEmail(email)).isEmpty();
    }

    @Test
    void aForgedOrMisdirectedTokenIsRefusedAndCreatesNothing() {
        String email = address("forged");
        assertThat(google(FixtureGoogleSigningKeys.mintForged(FixtureGoogleSigningKeys.validClaims(email, clientId)))
                .getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(google(FixtureGoogleSigningKeys.mint(FixtureGoogleSigningKeys.validClaims(email, "other-app")))
                .getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(userRepository.findByEmail(email)).isEmpty();
    }

    @Test
    void aMissingTokenIsABadRequest() {
        ResponseEntity<Map> response = restTemplate.postForEntity("/api/auth/google", Map.of(), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    private ResponseEntity<Map> google(String idToken) {
        return restTemplate.postForEntity("/api/auth/google",
                Map.of("idToken", idToken, "deviceLabel", "GoogleSignInTest"), Map.class);
    }
}
