package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.entity.EmailOtpCode;
import com.sarkaritaiyaari.backend.repository.EmailOtpCodeRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
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
 * The email one-time-code sign-in (V51), end to end over HTTP.
 *
 * <p>Codes are stored hashed, so a test cannot read one back. The redemption tests therefore insert
 * a code row with a KNOWN code's hash directly — the same row the service writes — and the request
 * tests assert on what the endpoint does and, crucially, never returns.
 *
 * <p>Addresses are {@code @gmail.com} because the endpoint only accepts Gmail, with a local part no
 * real person owns. Mail is off in the test configuration, so nothing is ever sent to them.
 */
class EmailOtpTest extends AbstractIntegrationTest {

    @Autowired private EmailOtpCodeRepository codeRepository;
    @Autowired private JdbcTemplate jdbc;

    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
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
        String email = "sarkaritaiyaari.autotest." + tag + "." + runId + "@gmail.com";
        emails.add(email);
        return email;
    }

    /* ---------------------------------------------------------------------------- requesting */

    @Test
    void aNonGmailAddressIsRejected() {
        ResponseEntity<Map> response = request("someone." + runId + "@example.com");
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void aRequestSucceedsAndNeverReturnsTheCode() {
        ResponseEntity<Map> response = request(address("request"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).containsEntry("expiresInMinutes", 10);
        // The response must not carry the code (expose-code-in-response is off by default).
        assertThat(response.getBody().get("code")).isNull();
        // And the stored row holds a hash, never the six digits.
        EmailOtpCode row = codeRepository.findNewestForEmail(emails.get(0)).orElseThrow();
        assertThat(row.getCodeHash()).startsWith("$2");
        assertThat(row.getCodeHash()).doesNotMatch("\\d{6}");
    }

    @Test
    void aSecondRequestInsideTheCooldownIsRefused() {
        String email = address("cooldown");
        assertThat(request(email).getStatusCode()).isEqualTo(HttpStatus.OK);

        ResponseEntity<Map> again = request(email);
        assertThat(again.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(String.valueOf(again.getBody().get("error"))).contains("wait");
    }

    @Test
    void theHourlySendCapIsEnforced() {
        String email = address("hourly");
        // Five codes already sent this hour, all older than the 60 s cooldown.
        for (int i = 0; i < 5; i++) {
            UUID id = insertCode(email, "000000", OffsetDateTime.now().plusMinutes(10));
            jdbc.update("UPDATE email_otp_codes SET created_at = now() - interval '10 minutes' - (? * interval '1 minute') WHERE id = ?",
                    i, id);
        }

        ResponseEntity<Map> response = request(email);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
        assertThat(String.valueOf(response.getBody().get("error"))).contains("Too many codes");
    }

    @Test
    void aNewCodeRetiresTheOldOne() {
        String email = address("retire");
        insertCode(email, "111111", OffsetDateTime.now().plusMinutes(10));
        jdbc.update("UPDATE email_otp_codes SET created_at = now() - interval '5 minutes' WHERE email = ?", email);

        assertThat(request(email).getStatusCode()).isEqualTo(HttpStatus.OK);

        // The first code can no longer be redeemed.
        assertThat(verify(email, "111111").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    /* ---------------------------------------------------------------------------- redeeming */

    @Test
    void theRightCodeSignsInAndCannotBeUsedTwice() {
        String email = address("once");
        insertCode(email, "246810", OffsetDateTime.now().plusMinutes(10));

        ResponseEntity<Map> first = verify(email, "246810");
        assertThat(first.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(first.getBody().get("token")).isNotNull();

        assertThat(verify(email, "246810").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void aWrongCodeIsRefused() {
        String email = address("wrong");
        insertCode(email, "135790", OffsetDateTime.now().plusMinutes(10));
        assertThat(verify(email, "999999").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void anExpiredCodeIsRefused() {
        String email = address("expired");
        insertCode(email, "112233", OffsetDateTime.now().minusMinutes(1));
        assertThat(verify(email, "112233").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    /** DEF-AUTH-001's regression guard: the attempt counter must survive a failed guess. */
    @Test
    void afterFiveWrongGuessesEvenTheRightCodeIsRefused() {
        String email = address("brute");
        insertCode(email, "864209", OffsetDateTime.now().plusMinutes(10));
        for (int i = 0; i < 5; i++) {
            assertThat(verify(email, "00000" + i).getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        }
        assertThat(verify(email, "864209").getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void theSameAddressSignsIntoTheSameAccount() {
        String email = address("same");
        insertCode(email, "102030", OffsetDateTime.now().plusMinutes(10));
        Object firstUser = ((Map<?, ?>) verify(email, "102030").getBody().get("user")).get("id");

        jdbc.update("UPDATE email_otp_codes SET created_at = now() - interval '5 minutes' WHERE email = ?", email);
        insertCode(email, "405060", OffsetDateTime.now().plusMinutes(10));
        Object secondUser = ((Map<?, ?>) verify(email, "405060").getBody().get("user")).get("id");

        assertThat(secondUser).isEqualTo(firstUser);
    }

    /* ------------------------------------------------------------------------------ helpers */

    private UUID insertCode(String email, String code, OffsetDateTime expiresAt) {
        EmailOtpCode row = new EmailOtpCode();
        row.setEmail(email);
        row.setCodeHash(encoder.encode(code));
        row.setExpiresAt(expiresAt);
        return codeRepository.saveAndFlush(row).getId();
    }

    private ResponseEntity<Map> request(String email) {
        return restTemplate.postForEntity("/api/auth/otp/request", Map.of("email", email), Map.class);
    }

    private ResponseEntity<Map> verify(String email, String code) {
        return restTemplate.postForEntity("/api/auth/otp/verify",
                Map.of("email", email, "code", code, "deviceLabel", "EmailOtpTest"), Map.class);
    }
}
