package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.AuthResponse;
import com.sarkaritaiyaari.backend.dto.LoginRequest;
import com.sarkaritaiyaari.backend.dto.RegisterRequest;
import com.sarkaritaiyaari.backend.repository.UserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class AuthTest extends AbstractIntegrationTest {

    @Autowired
    private UserRepository userRepository;

    private final List<String> createdEmails = new ArrayList<>();

    @AfterEach
    void cleanupUsers() {
        // Tokens cascade from users, so deleting the user is enough.
        createdEmails.forEach(email -> userRepository.findByEmail(email).ifPresent(userRepository::delete));
        createdEmails.clear();
    }

    @Test
    void register_returnsATokenAndNormalisesTheEmail() {
        AuthResponse auth = register("Auth.Test.One@Example.COM", "practice123", "Auth One");

        assertThat(auth.token()).isNotBlank();
        assertThat(auth.expiresAt()).isAfter(java.time.OffsetDateTime.now());
        // Stored lower-cased so lookups are case-insensitive.
        assertThat(auth.user().email()).isEqualTo("auth.test.one@example.com");
        assertThat(auth.user().displayName()).isEqualTo("Auth One");
    }

    @Test
    void register_rejectsADuplicateEmailRegardlessOfCase() {
        register("auth.test.two@example.com", "practice123", null);

        RegisterRequest duplicate = new RegisterRequest();
        duplicate.setEmail("AUTH.TEST.TWO@EXAMPLE.COM");
        duplicate.setPassword("practice123");

        ResponseEntity<Map> response = restTemplate.postForEntity("/api/auth/register", duplicate, Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void register_rejectsAShortPassword() {
        RegisterRequest request = new RegisterRequest();
        request.setEmail("auth.test.short@example.com");
        request.setPassword("short");

        ResponseEntity<Map> response = restTemplate.postForEntity("/api/auth/register", request, Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void login_worksWithADifferentlyCasedEmail() {
        register("auth.test.three@example.com", "practice123", null);

        LoginRequest request = new LoginRequest();
        request.setEmail("Auth.Test.Three@EXAMPLE.com");
        request.setPassword("practice123");

        ResponseEntity<AuthResponse> response =
                restTemplate.postForEntity("/api/auth/login", request, AuthResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().token()).isNotBlank();
    }

    /**
     * Both failures must be indistinguishable. Saying which half was wrong lets someone
     * discover which email addresses are registered.
     */
    @Test
    void login_failsIdenticallyForAWrongPasswordAndAnUnknownEmail() {
        register("auth.test.four@example.com", "practice123", null);

        LoginRequest wrongPassword = new LoginRequest();
        wrongPassword.setEmail("auth.test.four@example.com");
        wrongPassword.setPassword("definitely-wrong");

        LoginRequest unknownEmail = new LoginRequest();
        unknownEmail.setEmail("auth.test.nobody@example.com");
        unknownEmail.setPassword("practice123");

        ResponseEntity<Map> a = restTemplate.postForEntity("/api/auth/login", wrongPassword, Map.class);
        ResponseEntity<Map> b = restTemplate.postForEntity("/api/auth/login", unknownEmail, Map.class);

        assertThat(a.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(b.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(a.getBody().get("error")).isEqualTo(b.getBody().get("error"));
    }

    /**
     * Guards the LazyInitializationException that broke this in the first place: the
     * token's user must be loaded before the transaction closes.
     */
    @Test
    void me_returnsTheSignedInUser() {
        AuthResponse auth = register("auth.test.five@example.com", "practice123", "Auth Five");

        ResponseEntity<AuthResponse.UserResponse> response = restTemplate.exchange(
                "/api/auth/me", HttpMethod.GET, bearer(auth.token()), AuthResponse.UserResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().email()).isEqualTo("auth.test.five@example.com");
        assertThat(response.getBody().displayName()).isEqualTo("Auth Five");
    }

    @Test
    void me_rejectsAMissingOrInvalidToken() {
        ResponseEntity<Map> noHeader = restTemplate.getForEntity("/api/auth/me", Map.class);
        ResponseEntity<Map> junk = restTemplate.exchange(
                "/api/auth/me", HttpMethod.GET, bearer("not-a-real-token"), Map.class);

        assertThat(noHeader.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(junk.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void logout_revokesOnlyTheDeviceThatCalledIt() {
        AuthResponse first = register("auth.test.six@example.com", "practice123", null);

        LoginRequest secondDevice = new LoginRequest();
        secondDevice.setEmail("auth.test.six@example.com");
        secondDevice.setPassword("practice123");
        AuthResponse second = restTemplate.postForEntity("/api/auth/login", secondDevice, AuthResponse.class).getBody();

        ResponseEntity<Void> loggedOut = restTemplate.exchange(
                "/api/auth/logout", HttpMethod.POST, bearer(second.token()), Void.class);
        assertThat(loggedOut.getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        ResponseEntity<Map> revoked = restTemplate.exchange(
                "/api/auth/me", HttpMethod.GET, bearer(second.token()), Map.class);
        ResponseEntity<Map> stillValid = restTemplate.exchange(
                "/api/auth/me", HttpMethod.GET, bearer(first.token()), Map.class);

        assertThat(revoked.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(stillValid.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    /* ------------------------------------------------------------------- helpers */

    private AuthResponse register(String email, String password, String displayName) {
        RegisterRequest request = new RegisterRequest();
        request.setEmail(email);
        request.setPassword(password);
        request.setDisplayName(displayName);

        ResponseEntity<AuthResponse> response =
                restTemplate.postForEntity("/api/auth/register", request, AuthResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdEmails.add(email.trim().toLowerCase());
        return response.getBody();
    }

    private static HttpEntity<Void> bearer(String token) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        return new HttpEntity<>(headers);
    }
}
