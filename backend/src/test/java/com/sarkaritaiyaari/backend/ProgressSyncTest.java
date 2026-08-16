package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.AuthResponse;
import com.sarkaritaiyaari.backend.dto.ProgressDtos;
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

class ProgressSyncTest extends AbstractIntegrationTest {

    @Autowired
    private UserRepository userRepository;

    private final List<String> createdEmails = new ArrayList<>();

    @AfterEach
    void cleanupUsers() {
        // Progress rows cascade from the user.
        createdEmails.forEach(email -> userRepository.findByEmail(email).ifPresent(userRepository::delete));
        createdEmails.clear();
    }

    @Test
    void uploadThenRestore_returnsTheSameHistory() {
        String token = signUp("progress.one@example.com");

        ProgressDtos.SyncRequest request = new ProgressDtos.SyncRequest();
        request.setPracticeSessions(List.of(practiceSession("sess-1", 7, 10)));
        request.setMockAttempts(List.of(mockAttempt("mock-1")));

        ResponseEntity<ProgressDtos.SyncResponse> uploaded = restTemplate.exchange(
                "/api/progress/sync", HttpMethod.POST, authed(token, request), ProgressDtos.SyncResponse.class);

        assertThat(uploaded.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(uploaded.getBody().practiceSessionsStored()).isEqualTo(1);
        assertThat(uploaded.getBody().mockAttemptsStored()).isEqualTo(1);

        ProgressDtos.RestoreResponse restored = restore(token);

        assertThat(restored.practiceSessions()).hasSize(1);
        assertThat(restored.practiceSessions().get(0).getId()).isEqualTo("sess-1");
        assertThat(restored.practiceSessions().get(0).getCorrectCount()).isEqualTo(7);
        assertThat(restored.practiceSessions().get(0).getResults()).hasSize(2);

        assertThat(restored.mockAttempts()).hasSize(1);
        assertThat(restored.mockAttempts().get(0).getId()).isEqualTo("mock-1");
        assertThat(restored.mockAttempts().get(0).getTotalMarksScored()).isEqualByComparingTo("12.5");
        // An unattempted question keeps a null answer rather than being coerced to 0.
        assertThat(restored.mockAttempts().get(0).getResults().get(1).getSelectedIndex()).isNull();
    }

    /**
     * The whole point of a retrying upload queue: a session sent twice because the first
     * response was lost must not become two sessions.
     */
    @Test
    void uploadingTheSameSessionTwice_doesNotDuplicateIt() {
        String token = signUp("progress.two@example.com");

        ProgressDtos.SyncRequest request = new ProgressDtos.SyncRequest();
        request.setPracticeSessions(List.of(practiceSession("sess-dup", 5, 10)));

        restTemplate.exchange("/api/progress/sync", HttpMethod.POST, authed(token, request), ProgressDtos.SyncResponse.class);
        restTemplate.exchange("/api/progress/sync", HttpMethod.POST, authed(token, request), ProgressDtos.SyncResponse.class);

        ProgressDtos.RestoreResponse restored = restore(token);

        assertThat(restored.practiceSessions()).hasSize(1);
        // ...and its answers were replaced, not appended twice.
        assertThat(restored.practiceSessions().get(0).getResults()).hasSize(2);
    }

    /** One account must never see another's history, even though ids are device-generated. */
    @Test
    void oneUsersHistoryIsInvisibleToAnother() {
        String alice = signUp("progress.alice@example.com");
        String bob = signUp("progress.bob@example.com");

        ProgressDtos.SyncRequest request = new ProgressDtos.SyncRequest();
        request.setPracticeSessions(List.of(practiceSession("sess-alice", 9, 10)));
        restTemplate.exchange("/api/progress/sync", HttpMethod.POST, authed(alice, request), ProgressDtos.SyncResponse.class);

        assertThat(restore(alice).practiceSessions()).hasSize(1);
        assertThat(restore(bob).practiceSessions()).isEmpty();
    }

    @Test
    void progressEndpointsRequireSigningIn() {
        ProgressDtos.SyncRequest request = new ProgressDtos.SyncRequest();
        request.setPracticeSessions(List.of(practiceSession("sess-anon", 1, 1)));

        ResponseEntity<Map> upload = restTemplate.postForEntity("/api/progress/sync", request, Map.class);
        ResponseEntity<Map> read = restTemplate.getForEntity("/api/progress", Map.class);

        assertThat(upload.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(read.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    /* ------------------------------------------------------------------- helpers */

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

    private ProgressDtos.RestoreResponse restore(String token) {
        ResponseEntity<ProgressDtos.RestoreResponse> response = restTemplate.exchange(
                "/api/progress", HttpMethod.GET, authed(token, null), ProgressDtos.RestoreResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody();
    }

    private static ProgressDtos.PracticeSession practiceSession(String id, int correct, int total) {
        ProgressDtos.PracticeSession session = new ProgressDtos.PracticeSession();
        session.setId(id);
        session.setCompletedAt(OffsetDateTime.now());
        session.setExamLabel("SSC CGL");
        session.setSubjectName("Quantitative Aptitude");
        session.setTopicName("Percentage");
        session.setLevelLabel("Easy");
        session.setCorrectCount(correct);
        session.setTotalCount(total);

        List<ProgressDtos.PracticeResult> results = new ArrayList<>();
        for (int i = 0; i < 2; i++) {
            ProgressDtos.PracticeResult r = new ProgressDtos.PracticeResult();
            r.setOrderIndex(i);
            r.setQuestionId(UUID.randomUUID());
            r.setSelectedIndex(i);
            r.setCorrectIndex(0);
            r.setCorrect(i == 0);
            results.add(r);
        }
        session.setResults(results);
        return session;
    }

    private static ProgressDtos.MockAttempt mockAttempt(String id) {
        ProgressDtos.MockAttempt attempt = new ProgressDtos.MockAttempt();
        attempt.setId(id);
        attempt.setExamCode("SSC_CGL");
        attempt.setExamLabel("SSC CGL — Tier 1");
        attempt.setStartedAt(OffsetDateTime.now().minusMinutes(60));
        attempt.setCompletedAt(OffsetDateTime.now());
        attempt.setDurationSeconds(3600);
        attempt.setTimeTakenSeconds(3200);
        attempt.setMarksCorrect(new java.math.BigDecimal("2"));
        attempt.setMarksWrong(new java.math.BigDecimal("0.5"));
        attempt.setTotalMarksScored(new java.math.BigDecimal("12.5"));
        attempt.setCorrectCount(7);
        attempt.setWrongCount(3);
        attempt.setUnattemptedCount(1);
        attempt.setTotalQuestions(11);

        List<ProgressDtos.MockResult> results = new ArrayList<>();
        ProgressDtos.MockResult answered = new ProgressDtos.MockResult();
        answered.setOrderIndex(0);
        answered.setSubjectName("Quantitative Aptitude");
        answered.setQuestionId(UUID.randomUUID());
        answered.setSelectedIndex(2);
        answered.setCorrectIndex(2);
        results.add(answered);

        ProgressDtos.MockResult skipped = new ProgressDtos.MockResult();
        skipped.setOrderIndex(1);
        skipped.setSubjectName("Reasoning");
        skipped.setQuestionId(UUID.randomUUID());
        skipped.setSelectedIndex(null);
        skipped.setCorrectIndex(1);
        skipped.setMarkedForReview(true);
        results.add(skipped);

        attempt.setResults(results);
        return attempt;
    }

    private static <T> HttpEntity<T> authed(String token, T body) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, headers);
    }
}
