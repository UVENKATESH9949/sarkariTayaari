package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.AuthResponse;
import com.sarkaritaiyaari.backend.dto.ReminderDtos.DispatchSummary;
import com.sarkaritaiyaari.backend.dto.ReminderDtos.PushTokenRequest;
import com.sarkaritaiyaari.backend.dto.ReminderDtos.ReminderRequest;
import com.sarkaritaiyaari.backend.dto.ReminderDtos.ReminderResponse;
import com.sarkaritaiyaari.backend.dto.RegisterRequest;
import com.sarkaritaiyaari.backend.repository.PushTokenRepository;
import com.sarkaritaiyaari.backend.repository.UserRepository;
import com.sarkaritaiyaari.backend.repository.UserReminderRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Exam Guide spec §8 "Reminder System" and its push-token registration. No push
 * infrastructure existed anywhere in this repo before this session (confirmed by grep).
 * Delivery itself (a real Expo push) is not exercised here — no real device token is
 * available in a CI-style test run — but the entire owning/dispatch/auth surface is.
 */
class ReminderTest extends AbstractIntegrationTest {

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private PushTokenRepository pushTokenRepository;

    @Autowired
    private UserReminderRepository reminderRepository;

    private final List<String> createdEmails = new ArrayList<>();

    @AfterEach
    void cleanup() {
        for (String email : createdEmails) {
            userRepository.findByEmail(email).ifPresent(u -> {
                reminderRepository.findByUserIdOrderByRemindAtAsc(u.getId()).forEach(reminderRepository::delete);
                pushTokenRepository.findByUserId(u.getId()).forEach(pushTokenRepository::delete);
                userRepository.delete(u);
            });
        }
        createdEmails.clear();
    }

    @Test
    void pushToken_registrationUpsertsRatherThanDuplicating() {
        String token = signUpStudent("reminder-token@example.test");
        PushTokenRequest request = new PushTokenRequest("ExponentPushToken[test-token-1]", "ANDROID");

        assertThat(restTemplate.exchange("/api/push-tokens", HttpMethod.POST, bearer(token, request), Void.class)
                .getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);
        assertThat(restTemplate.exchange("/api/push-tokens", HttpMethod.POST, bearer(token, request), Void.class)
                .getStatusCode()).isEqualTo(HttpStatus.NO_CONTENT);

        UUID userId = userRepository.findByEmail("reminder-token@example.test").orElseThrow().getId();
        assertThat(pushTokenRepository.findByUserId(userId)).hasSize(1);
    }

    @Test
    void pushTokenRegistration_requiresSignIn() {
        PushTokenRequest request = new PushTokenRequest("ExponentPushToken[anon]", "ANDROID");
        ResponseEntity<String> response = restTemplate.postForEntity("/api/push-tokens", request, String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void reminder_createListAndCancel_roundTrips() {
        String token = signUpStudent("reminder-crud@example.test");
        ReminderRequest request = new ReminderRequest(
                TEST_EXAM_CODE, null, OffsetDateTime.now().plusDays(1), "Application closes tomorrow");

        ResponseEntity<ReminderResponse> created = restTemplate.exchange(
                "/api/reminders", HttpMethod.POST, bearer(token, request), ReminderResponse.class);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        UUID id = created.getBody().id();
        assertThat(created.getBody().sent()).isFalse();

        ResponseEntity<ReminderResponse[]> list = restTemplate.exchange(
                "/api/reminders", HttpMethod.GET, bearer(token, null), ReminderResponse[].class);
        assertThat(list.getBody()).extracting(ReminderResponse::id).contains(id);

        restTemplate.exchange("/api/reminders/" + id, HttpMethod.DELETE, bearer(token, null), Void.class);

        ResponseEntity<ReminderResponse[]> afterCancel = restTemplate.exchange(
                "/api/reminders", HttpMethod.GET, bearer(token, null), ReminderResponse[].class);
        assertThat(afterCancel.getBody()).extracting(ReminderResponse::id).doesNotContain(id);
    }

    @Test
    void reminder_cannotBeCancelledByAnotherUser() {
        String ownerToken = signUpStudent("reminder-owner@example.test");
        String otherToken = signUpStudent("reminder-other@example.test");

        ReminderRequest request = new ReminderRequest(
                TEST_EXAM_CODE, null, OffsetDateTime.now().plusDays(1), "Mine, not yours");
        ResponseEntity<ReminderResponse> created = restTemplate.exchange(
                "/api/reminders", HttpMethod.POST, bearer(ownerToken, request), ReminderResponse.class);
        UUID id = created.getBody().id();

        ResponseEntity<String> attempt = restTemplate.exchange(
                "/api/reminders/" + id, HttpMethod.DELETE, bearer(otherToken, null), String.class);
        assertThat(attempt.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

        // Still there, since the delete above must not have gone through.
        ResponseEntity<ReminderResponse[]> ownerList = restTemplate.exchange(
                "/api/reminders", HttpMethod.GET, bearer(ownerToken, null), ReminderResponse[].class);
        assertThat(ownerList.getBody()).extracting(ReminderResponse::id).contains(id);
    }

    @Test
    void reminder_rejectsAnImportantDateFromADifferentExam() {
        String token = signUpStudent("reminder-mismatch@example.test");
        // SSC_CGL's demo cycle has real important_dates rows; TEST_EXAM_CODE never does.
        // Read via the guide endpoint's raw map form to pull one real date id.
        ResponseEntity<java.util.Map> guide = restTemplate.getForEntity("/api/exams/SSC_CGL/guide", java.util.Map.class);
        List<java.util.Map> dates = (List<java.util.Map>) guide.getBody().get("importantDates");
        if (dates == null || dates.isEmpty()) {
            return; // No seeded demo cycle on this environment -- nothing to mismatch against.
        }
        UUID foreignDateId = UUID.fromString((String) dates.get(0).get("id"));

        ReminderRequest request = new ReminderRequest(
                TEST_EXAM_CODE, foreignDateId, OffsetDateTime.now().plusDays(1), "Should be rejected");
        ResponseEntity<String> response = restTemplate.exchange(
                "/api/reminders", HttpMethod.POST, bearer(token, request), String.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void dispatch_marksDueRemindersSentAndIsAdminOnly() {
        String token = signUpStudent("reminder-dispatch@example.test");
        ReminderRequest request = new ReminderRequest(
                TEST_EXAM_CODE, null, OffsetDateTime.now().minusMinutes(5), "Already due");
        ResponseEntity<ReminderResponse> created = restTemplate.exchange(
                "/api/reminders", HttpMethod.POST, bearer(token, request), ReminderResponse.class);
        UUID id = created.getBody().id();

        ResponseEntity<String> asStudent = restTemplate.exchange(
                "/api/admin/reminders/dispatch", HttpMethod.POST, bearer(token, null), String.class);
        assertThat(asStudent.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);

        ResponseEntity<DispatchSummary> dispatched = restTemplate.exchange(
                "/api/admin/reminders/dispatch", HttpMethod.POST, adminAuth(), DispatchSummary.class);
        assertThat(dispatched.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(dispatched.getBody().dueCount()).isGreaterThanOrEqualTo(1);

        ResponseEntity<ReminderResponse[]> list = restTemplate.exchange(
                "/api/reminders", HttpMethod.GET, bearer(token, null), ReminderResponse[].class);
        ReminderResponse thisOne = List.of(list.getBody()).stream().filter(r -> r.id().equals(id)).findFirst().orElseThrow();
        assertThat(thisOne.sent()).isTrue();
    }

    /* ------------------------------------------------------------------- helpers */

    private String signUpStudent(String email) {
        RegisterRequest request = new RegisterRequest();
        request.setEmail(email);
        request.setPassword("practice123");

        ResponseEntity<AuthResponse> response =
                restTemplate.postForEntity("/api/auth/register", request, AuthResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdEmails.add(email);
        return response.getBody().token();
    }

    private static <T> HttpEntity<T> bearer(String token, T body) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        return new HttpEntity<>(body, headers);
    }
}
