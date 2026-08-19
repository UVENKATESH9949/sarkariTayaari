package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.AuthResponse;
import com.sarkaritaiyaari.backend.dto.ExamRequest;
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

/**
 * Confirms the real gap this feature closes: every content-management endpoint used to
 * accept requests from anyone. These tests hit the endpoints directly (not through
 * AuthService) so a regression shows up even if someone "fixes" it by editing the wrong
 * layer.
 */
class AdminAuthTest extends AbstractIntegrationTest {

    @Autowired
    private UserRepository userRepository;

    private final List<String> createdEmails = new ArrayList<>();

    @AfterEach
    void cleanupUsers() {
        createdEmails.forEach(email -> userRepository.findByEmail(email).ifPresent(userRepository::delete));
        createdEmails.clear();
    }

    @Test
    void createExam_rejectsAnonymousRequests() {
        ResponseEntity<Map> response = restTemplate.postForEntity("/api/exams", sampleExam("ADMIN_AUTH_ANON"), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void createExam_rejectsAStudentToken() {
        String studentToken = signUpStudent("admin-auth-student@example.com");

        ResponseEntity<Map> response = restTemplate.exchange(
                "/api/exams", HttpMethod.POST, bearer(studentToken, sampleExam("ADMIN_AUTH_STUDENT")), Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);
    }

    @Test
    void createExam_succeedsWithAnAdminToken() {
        ResponseEntity<Map> response = restTemplate.exchange(
                "/api/exams", HttpMethod.POST, adminAuth(sampleExam("ADMIN_AUTH_OK")), Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdExamCodes.add("ADMIN_AUTH_OK");
    }

    @Test
    void registerAdmin_rejectsAnonymousAndStudentCallers() {
        RegisterRequest request = new RegisterRequest();
        request.setEmail("admin-auth-should-not-exist@example.com");
        request.setPassword("practice123");

        ResponseEntity<Map> anonymous = restTemplate.postForEntity("/api/auth/admin/register", request, Map.class);
        assertThat(anonymous.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);

        String studentToken = signUpStudent("admin-auth-registrar-student@example.com");
        ResponseEntity<Map> asStudent = restTemplate.exchange(
                "/api/auth/admin/register", HttpMethod.POST, bearer(studentToken, request), Map.class);
        assertThat(asStudent.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);

        assertThat(userRepository.existsByEmail("admin-auth-should-not-exist@example.com")).isFalse();
    }

    @Test
    void registerAdmin_createsAnAdminAccountWithNoTokenOrPasswordHashLeaked() {
        RegisterRequest request = new RegisterRequest();
        request.setEmail("admin-auth-new-admin@example.com");
        request.setPassword("practice123");
        request.setDisplayName("New Admin");
        createdEmails.add("admin-auth-new-admin@example.com");

        ResponseEntity<AuthResponse.UserResponse> response = restTemplate.exchange(
                "/api/auth/admin/register", HttpMethod.POST, adminAuth(request), AuthResponse.UserResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody().role()).isEqualTo("ADMIN");
        assertThat(response.getBody().email()).isEqualTo("admin-auth-new-admin@example.com");

        // No token field on this response type at all — a raw Map confirms nothing extra leaked either.
        createdEmails.add("admin-auth-new-admin-2@example.com");
        ResponseEntity<Map> raw = restTemplate.exchange(
                "/api/auth/admin/register", HttpMethod.POST, adminAuth(otherAdminRequest()), Map.class);
        assertThat(raw.getBody()).doesNotContainKeys("token", "passwordHash", "password");
    }

    @Test
    void publicSyncEndpoints_remainAccessibleWithNoToken() {
        assertThat(restTemplate.getForEntity("/api/exams", Object[].class).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(restTemplate.getForEntity("/api/subjects", Object[].class).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(restTemplate.getForEntity("/api/topics", Object[].class).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(restTemplate.getForEntity("/api/difficulty-levels", Object[].class).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(restTemplate.getForEntity("/api/paper-types", Object[].class).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(restTemplate.getForEntity("/api/languages", Object[].class).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(restTemplate.getForEntity("/api/exam-structures", Object[].class).getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(restTemplate.getForEntity("/api/questions/sync", Object.class).getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    /* ------------------------------------------------------------------- helpers */

    private String signUpStudent(String email) {
        RegisterRequest request = new RegisterRequest();
        request.setEmail(email);
        request.setPassword("practice123");

        ResponseEntity<AuthResponse> response =
                restTemplate.postForEntity("/api/auth/register", request, AuthResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        assertThat(response.getBody().user().role()).isEqualTo("STUDENT");
        createdEmails.add(email);
        return response.getBody().token();
    }

    private static ExamRequest sampleExam(String code) {
        ExamRequest request = new ExamRequest();
        request.setCode(code);
        request.setName("Admin Auth Test Exam");
        request.setActive(false);
        request.setDisplayOrder(999);
        return request;
    }

    private RegisterRequest otherAdminRequest() {
        RegisterRequest request = new RegisterRequest();
        request.setEmail("admin-auth-new-admin-2@example.com");
        request.setPassword("practice123");
        return request;
    }

    private static <T> HttpEntity<T> bearer(String token, T body) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        return new HttpEntity<>(body, headers);
    }
}
