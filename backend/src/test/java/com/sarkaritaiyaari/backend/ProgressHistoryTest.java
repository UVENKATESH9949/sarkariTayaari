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

/**
 * TASK-2601 Phase 3 — the paged history reads and single-item detail fetches a browser
 * needs (no local database to page through locally, unlike mobile). {@code GET /api/progress}
 * itself (the full, unpaginated restore) is untouched and still covered by
 * {@link ProgressSyncTest} — these are the new reads layered alongside it.
 */
class ProgressHistoryTest extends AbstractIntegrationTest {

    @Autowired
    private UserRepository userRepository;

    private final List<String> createdEmails = new ArrayList<>();

    @AfterEach
    void cleanupUsers() {
        createdEmails.forEach(email -> userRepository.findByEmail(email).ifPresent(userRepository::delete));
        createdEmails.clear();
    }

    @Test
    void sessions_arePagedAndOrderedMostRecentFirst() {
        String token = signUp("history.sessions@example.com");
        upload(token, List.of(
                practiceSession("s-old", OffsetDateTime.now().minusDays(2), 5, 10),
                practiceSession("s-new", OffsetDateTime.now(), 8, 10)));

        ResponseEntity<Map> page = restTemplate.exchange(
                "/api/progress/sessions?page=0&size=1", HttpMethod.GET, authed(token, null), Map.class);

        assertThat(page.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<Map<?, ?>> content = (List<Map<?, ?>>) page.getBody().get("content");
        assertThat(content).hasSize(1);
        assertThat(content.get(0).get("id")).isEqualTo("s-new");
        assertThat(page.getBody().get("totalElements")).isEqualTo(2);
        // The summary shape carries no per-question results — that's what keeps a page light.
        assertThat(content.get(0).containsKey("results")).isFalse();
    }

    @Test
    void sessionDetail_returnsFullResultsForTheOwner_and404sForAnotherUser() {
        String alice = signUp("history.alice@example.com");
        String bob = signUp("history.bob@example.com");
        upload(alice, List.of(practiceSession("s-alice-detail", OffsetDateTime.now(), 6, 10)));

        ResponseEntity<ProgressDtos.PracticeSession> ownRead = restTemplate.exchange(
                "/api/progress/sessions/s-alice-detail", HttpMethod.GET, authed(alice, null), ProgressDtos.PracticeSession.class);
        assertThat(ownRead.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(ownRead.getBody().getResults()).hasSize(2);

        ResponseEntity<Map> foreignRead = restTemplate.exchange(
                "/api/progress/sessions/s-alice-detail", HttpMethod.GET, authed(bob, null), Map.class);
        assertThat(foreignRead.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);

        ResponseEntity<Map> unknownRead = restTemplate.exchange(
                "/api/progress/sessions/does-not-exist", HttpMethod.GET, authed(alice, null), Map.class);
        assertThat(unknownRead.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void attempts_arePagedAndAttemptDetailIsOwnershipScoped() {
        String alice = signUp("history.attempts.alice@example.com");
        String bob = signUp("history.attempts.bob@example.com");
        uploadAttempt(alice, "a-alice");

        ResponseEntity<Map> page = restTemplate.exchange(
                "/api/progress/attempts?page=0&size=20", HttpMethod.GET, authed(alice, null), Map.class);
        assertThat(page.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<Map<?, ?>> content = (List<Map<?, ?>>) page.getBody().get("content");
        assertThat(content).hasSize(1);
        assertThat(content.get(0).get("id")).isEqualTo("a-alice");
        assertThat(content.get(0).containsKey("results")).isFalse();

        ResponseEntity<ProgressDtos.MockAttempt> ownDetail = restTemplate.exchange(
                "/api/progress/attempts/a-alice", HttpMethod.GET, authed(alice, null), ProgressDtos.MockAttempt.class);
        assertThat(ownDetail.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(ownDetail.getBody().getResults()).hasSize(1);

        ResponseEntity<Map> foreignDetail = restTemplate.exchange(
                "/api/progress/attempts/a-alice", HttpMethod.GET, authed(bob, null), Map.class);
        assertThat(foreignDetail.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    void wrongAnswers_returnsOnlyIncorrectPracticeResults_mostRecentFirst() {
        String token = signUp("history.wrong@example.com");
        upload(token, List.of(practiceSession("s-wrong", OffsetDateTime.now(), 1, 2)));

        ResponseEntity<Map> page = restTemplate.exchange(
                "/api/progress/wrong-answers?page=0&size=20", HttpMethod.GET, authed(token, null), Map.class);

        assertThat(page.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<Map<?, ?>> content = (List<Map<?, ?>>) page.getBody().get("content");
        // practiceSession() below creates one correct + one wrong result per session.
        assertThat(content).hasSize(1);
        assertThat(content.get(0).get("subjectName")).isEqualTo("Quantitative Aptitude");
    }

    @Test
    void historyEndpointsRequireSigningIn() {
        assertThat(restTemplate.getForEntity("/api/progress/sessions", Map.class).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(restTemplate.getForEntity("/api/progress/attempts", Map.class).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        assertThat(restTemplate.getForEntity("/api/progress/wrong-answers", Map.class).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
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

    private void upload(String token, List<ProgressDtos.PracticeSession> sessions) {
        ProgressDtos.SyncRequest request = new ProgressDtos.SyncRequest();
        request.setPracticeSessions(sessions);
        ResponseEntity<ProgressDtos.SyncResponse> response = restTemplate.exchange(
                "/api/progress/sync", HttpMethod.POST, authed(token, request), ProgressDtos.SyncResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    private void uploadAttempt(String token, String id) {
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
        attempt.setTotalMarksScored(new java.math.BigDecimal("2"));
        attempt.setCorrectCount(1);
        attempt.setWrongCount(0);
        attempt.setUnattemptedCount(0);
        attempt.setTotalQuestions(1);

        ProgressDtos.MockResult result = new ProgressDtos.MockResult();
        result.setOrderIndex(0);
        result.setSubjectName("Quantitative Aptitude");
        result.setQuestionId(UUID.randomUUID());
        result.setSelectedIndex(0);
        result.setCorrectIndex(0);
        attempt.setResults(List.of(result));

        ProgressDtos.SyncRequest request = new ProgressDtos.SyncRequest();
        request.setMockAttempts(List.of(attempt));
        ResponseEntity<ProgressDtos.SyncResponse> response = restTemplate.exchange(
                "/api/progress/sync", HttpMethod.POST, authed(token, request), ProgressDtos.SyncResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    private static ProgressDtos.PracticeSession practiceSession(String id, OffsetDateTime completedAt, int correct, int total) {
        ProgressDtos.PracticeSession session = new ProgressDtos.PracticeSession();
        session.setId(id);
        session.setCompletedAt(completedAt);
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
            r.setCorrect(i == 0); // one correct, one wrong per session
            results.add(r);
        }
        session.setResults(results);
        return session;
    }

    private static <T> HttpEntity<T> authed(String token, T body) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        headers.setContentType(org.springframework.http.MediaType.APPLICATION_JSON);
        return new HttpEntity<>(body, headers);
    }
}
