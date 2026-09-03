package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.AuthResponse;
import com.sarkaritaiyaari.backend.dto.FollowedExamDtos;
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

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** Mirrors {@link BookmarkSyncTest} exactly — same conflict-resolution shape, different entity. */
class FollowedExamSyncTest extends AbstractIntegrationTest {

    @Autowired
    private UserRepository userRepository;

    private final List<String> createdEmails = new ArrayList<>();

    @AfterEach
    void cleanupUsers() {
        createdEmails.forEach(email -> userRepository.findByEmail(email).ifPresent(userRepository::delete));
        createdEmails.clear();
    }

    @Test
    void uploadThenRestore_returnsOnlyWhatsStillFollowed() {
        String token = signUp("followedexam.one@example.com");
        String keep = "DISC_KEEP_" + shortId();
        String remove = "DISC_REM_" + shortId();
        OffsetDateTime now = OffsetDateTime.now();

        sync(token, followed(keep, false, now), followed(remove, false, now));
        // Unfollowed a moment later — this is the state that must win.
        sync(token, followed(remove, true, now.plusSeconds(5)));

        FollowedExamDtos.RestoreResponse restored = restore(token);

        assertThat(restored.exams()).hasSize(1);
        assertThat(restored.exams().get(0).getExamCode()).isEqualTo(keep);
    }

    /**
     * The whole reason this isn't a plain upsert: a stale retry (or a second device
     * replaying an older toggle) must not undo a newer change already on the server.
     */
    @Test
    void anOlderUpdate_neverOverwritesANewerOne() {
        String token = signUp("followedexam.two@example.com");
        String examCode = "DISC_ORD_" + shortId();
        OffsetDateTime now = OffsetDateTime.now();

        sync(token, followed(examCode, false, now));
        // An unfollow timestamped BEFORE the follow above arrives late (e.g. a queued
        // request from a device that was offline). It must not win.
        sync(token, followed(examCode, true, now.minusMinutes(1)));

        FollowedExamDtos.RestoreResponse restored = restore(token);

        assertThat(restored.exams()).hasSize(1);
        assertThat(restored.exams().get(0).getExamCode()).isEqualTo(examCode);
        assertThat(restored.exams().get(0).isDeleted()).isFalse();
    }

    @Test
    void reSyncingTheSameToggle_doesNotDuplicateOrError() {
        String token = signUp("followedexam.three@example.com");
        String examCode = "DISC_RETRY_" + shortId();
        FollowedExamDtos.FollowedExam toggle = followed(examCode, false, OffsetDateTime.now());

        sync(token, toggle);
        sync(token, toggle);

        assertThat(restore(token).exams()).hasSize(1);
    }

    @Test
    void oneUsersFollowedExamsAreInvisibleToAnother() {
        String alice = signUp("followedexam.alice@example.com");
        String bob = signUp("followedexam.bob@example.com");

        sync(alice, followed("DISC_ALC_" + shortId(), false, OffsetDateTime.now()));

        assertThat(restore(alice).exams()).hasSize(1);
        assertThat(restore(bob).exams()).isEmpty();
    }

    @Test
    void followedExamEndpointsRequireSigningIn() {
        FollowedExamDtos.SyncRequest request = new FollowedExamDtos.SyncRequest();
        request.setExams(List.of(followed("DISC_ANO_" + shortId(), false, OffsetDateTime.now())));

        ResponseEntity<Map> upload = restTemplate.postForEntity("/api/followed-exams/sync", request, Map.class);
        ResponseEntity<Map> read = restTemplate.getForEntity("/api/followed-exams", Map.class);

        assertThat(upload.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(read.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    /* ------------------------------------------------------------------- helpers */

    /**
     * 8 hex chars, not a full UUID: {@code exams.code} is VARCHAR(30) in the real schema
     * (V2__content_model_redesign.sql) and this table's own exam_code/id columns are
     * sized to match real exam codes, not arbitrary test identifiers. A full UUID
     * embedded in a prefixed test code overflowed both columns and turned into a live
     * 500 the first time this suite ran — caught by actually running it, not by review.
     */
    private static String shortId() {
        return UUID.randomUUID().toString().substring(0, 8);
    }

    private String signUp(String email) {
        RegisterRequest request = new RegisterRequest();
        request.setEmail(email);
        request.setPassword("practice123");

        ResponseEntity<AuthResponse> response =
                restTemplate.postForEntity("/api/auth/register", request, AuthResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdEmails.add(email);
        return response.getBody().token();
    }

    private void sync(String token, FollowedExamDtos.FollowedExam... toUpload) {
        FollowedExamDtos.SyncRequest request = new FollowedExamDtos.SyncRequest();
        request.setExams(List.of(toUpload));
        ResponseEntity<FollowedExamDtos.SyncResponse> response = restTemplate.exchange(
                "/api/followed-exams/sync", HttpMethod.POST, authed(token, request),
                FollowedExamDtos.SyncResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    private FollowedExamDtos.RestoreResponse restore(String token) {
        ResponseEntity<FollowedExamDtos.RestoreResponse> response = restTemplate.exchange(
                "/api/followed-exams", HttpMethod.GET, authed(token, null), FollowedExamDtos.RestoreResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody();
    }

    private static FollowedExamDtos.FollowedExam followed(String examCode, boolean deleted, OffsetDateTime updatedAt) {
        FollowedExamDtos.FollowedExam dto = new FollowedExamDtos.FollowedExam();
        dto.setExamCode(examCode);
        dto.setDeleted(deleted);
        dto.setUpdatedAt(updatedAt);
        return dto;
    }

    private static <T> HttpEntity<T> authed(String token, T body) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, headers);
    }
}
