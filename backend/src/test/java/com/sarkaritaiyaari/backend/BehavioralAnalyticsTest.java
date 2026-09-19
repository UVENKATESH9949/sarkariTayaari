package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.AuthResponse;
import com.sarkaritaiyaari.backend.dto.CreateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.ProgressDtos;
import com.sarkaritaiyaari.backend.dto.QuestionResponse;
import com.sarkaritaiyaari.backend.dto.RegisterRequest;
import com.sarkaritaiyaari.backend.dto.UpdateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.UserAnalyticsDtos;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The behavioural data foundation (TASK-2801): what gets captured, that it cannot be corrupted
 * across accounts, and that the derived analytics count it the way they claim to.
 *
 * <p>Every test signs up its own throwaway account, so these run against the shared dev database
 * without seeing — or being seen by — any other test's history. Progress rows cascade from the
 * user, so deleting the account is the whole cleanup.
 */
class BehavioralAnalyticsTest extends AbstractIntegrationTest {

    private final List<String> createdEmails = new ArrayList<>();

    @AfterEach
    void cleanupUsers() {
        createdEmails.forEach(email -> userRepository.findByEmail(email).ifPresent(userRepository::delete));
        createdEmails.clear();
    }

    /* =============================================== D4: ownership of a device-generated id */

    /**
     * The defect this milestone opened with.
     *
     * <p>The upload path checked only whether an id existed, not whose it was, and then set the
     * row's user to the caller — so uploading somebody else's id overwrote their session and
     * reassigned it. Mobile's ids were {@code session-<millis>}: guessable, and collidable by
     * accident. Here Bob deliberately names Alice's id.
     */
    @Test
    void anotherAccountsSessionIdIsRejected_notMergedOverTheirs() {
        String alice = signUp("analytics.alice@example.com");
        String bob = signUp("analytics.bob@example.com");
        String sharedId = "session-collision-" + UUID.randomUUID();

        ProgressDtos.SyncRequest aliceUpload = new ProgressDtos.SyncRequest();
        aliceUpload.setPracticeSessions(List.of(session(sharedId, 9, 10, UUID.randomUUID())));
        upload(alice, aliceUpload);

        ProgressDtos.SyncRequest bobUpload = new ProgressDtos.SyncRequest();
        bobUpload.setPracticeSessions(List.of(session(sharedId, 1, 10, UUID.randomUUID())));
        ProgressDtos.SyncResponse bobResponse = upload(bob, bobUpload);

        // Refused for Bob, and named so a client can tell rather than retrying blindly forever.
        assertThat(bobResponse.practiceSessionsStored()).isZero();
        assertThat(bobResponse.rejectedPracticeSessionIds()).containsExactly(sharedId);

        // Alice still owns it, with her own numbers — not Bob's 1-of-10 written over them.
        ProgressDtos.RestoreResponse aliceHistory = restore(alice);
        assertThat(aliceHistory.practiceSessions()).hasSize(1);
        assertThat(aliceHistory.practiceSessions().get(0).getCorrectCount()).isEqualTo(9);

        // And Bob did not quietly acquire it.
        assertThat(restore(bob).practiceSessions()).isEmpty();
    }

    /** One bad id must not strand the rest of a device's queue. */
    @Test
    void aRejectedIdDoesNotBlockTheRestOfTheBatch() {
        String alice = signUp("analytics.batch.alice@example.com");
        String bob = signUp("analytics.batch.bob@example.com");
        String contested = "session-contested-" + UUID.randomUUID();
        String bobsOwn = "session-bobs-" + UUID.randomUUID();

        ProgressDtos.SyncRequest aliceUpload = new ProgressDtos.SyncRequest();
        aliceUpload.setPracticeSessions(List.of(session(contested, 9, 10, UUID.randomUUID())));
        upload(alice, aliceUpload);

        ProgressDtos.SyncRequest bobUpload = new ProgressDtos.SyncRequest();
        bobUpload.setPracticeSessions(List.of(
                session(contested, 1, 10, UUID.randomUUID()),
                session(bobsOwn, 8, 10, UUID.randomUUID())));
        ProgressDtos.SyncResponse response = upload(bob, bobUpload);

        assertThat(response.practiceSessionsStored()).isEqualTo(1);
        assertThat(response.rejectedPracticeSessionIds()).containsExactly(contested);
        assertThat(restore(bob).practiceSessions()).hasSize(1);
        assertThat(restore(bob).practiceSessions().get(0).getId()).isEqualTo(bobsOwn);
    }

    /* ======================================================= capture: session timing/context */

    /**
     * The four fields the device recorded and never sent. They have to survive the round trip, or
     * a student's real study time is still lost the moment they change phones.
     */
    @Test
    void practiceSessionTimingAndExamSurviveUploadAndRestore() {
        String token = signUp("analytics.timing@example.com");
        OffsetDateTime completedAt = OffsetDateTime.now();

        ProgressDtos.PracticeSession session = session("session-timed-" + UUID.randomUUID(), 8, 10, UUID.randomUUID());
        session.setCompletedAt(completedAt);
        session.setStartedAt(completedAt.minusMinutes(12));
        session.setDurationMs(720_000L);
        session.setAvailableCount(25);
        session.setExamCode(TEST_EXAM_CODE);

        ProgressDtos.SyncRequest request = new ProgressDtos.SyncRequest();
        request.setPracticeSessions(List.of(session));
        upload(token, request);

        ProgressDtos.PracticeSession restored = restore(token).practiceSessions().get(0);
        assertThat(restored.getDurationMs()).isEqualTo(720_000L);
        assertThat(restored.getAvailableCount()).isEqualTo(25);
        assertThat(restored.getExamCode()).isEqualTo(TEST_EXAM_CODE);
        assertThat(restored.getStartedAt()).isNotNull();

        UserAnalyticsDtos.Overview overview = overview(token, null);
        assertThat(overview.totalStudyTimeMs()).isEqualTo(720_000L);
        assertThat(overview.practiceSessionsWithoutDuration()).isZero();
    }

    /**
     * A session uploaded by a client that predates V47 has no duration, and that must read as
     * "not measured" rather than as zero-length study — otherwise the headline figure quietly
     * understates a long history with no way to tell.
     */
    @Test
    void aSessionWithNoDurationIsCountedAsUnmeasured_notAsZeroTime() {
        String token = signUp("analytics.nodration@example.com");

        ProgressDtos.SyncRequest request = new ProgressDtos.SyncRequest();
        request.setPracticeSessions(List.of(session("session-legacy-" + UUID.randomUUID(), 5, 10, UUID.randomUUID())));
        upload(token, request);

        UserAnalyticsDtos.Overview overview = overview(token, null);
        assertThat(overview.totalStudyTimeMs()).isZero();
        assertThat(overview.practiceSessionsWithoutDuration()).isEqualTo(1);
        assertThat(overview.totalPracticeSessions()).isEqualTo(1);
    }

    /* ================================================ the classification snapshot (the point) */

    /**
     * The decisive test for D1.
     *
     * <p>A question is answered while tagged {@code easy}. An admin then retags it {@code hard}.
     * The student's history must not move: before the snapshot existed, every reader joined
     * {@code questions} live, so that edit silently rewrote what the student had done.
     */
    @Test
    void retaggingAQuestionDoesNotRewriteHistoryAlreadyRecorded() {
        String token = signUp("analytics.snapshot@example.com");
        UUID questionId = createQuestion("easy");

        ProgressDtos.SyncRequest request = new ProgressDtos.SyncRequest();
        request.setPracticeSessions(List.of(session("session-snap-" + UUID.randomUUID(), 1, 1, questionId)));
        upload(token, request);

        List<UserAnalyticsDtos.DifficultyStat> before = difficulty(token);
        assertThat(before).extracting(UserAnalyticsDtos.DifficultyStat::difficultyCode).containsExactly("easy");

        retagDifficulty(questionId, "hard");

        List<UserAnalyticsDtos.DifficultyStat> after = difficulty(token);
        assertThat(after).extracting(UserAnalyticsDtos.DifficultyStat::difficultyCode).containsExactly("easy");
        assertThat(after.get(0).attempts()).isEqualTo(1);
    }

    /** The snapshot is what the per-topic and per-subject views group by, so it has to be written. */
    @Test
    void topicAndSubjectAnalyticsComeFromTheSnapshot() {
        String token = signUp("analytics.topic@example.com");
        UUID questionId = createQuestion("easy");

        ProgressDtos.SyncRequest request = new ProgressDtos.SyncRequest();
        request.setPracticeSessions(List.of(session("session-topic-" + UUID.randomUUID(), 1, 1, questionId)));
        upload(token, request);

        List<UserAnalyticsDtos.TopicStat> topics = topics(token);
        assertThat(topics).hasSize(1);
        assertThat(topics.get(0).topicId()).isEqualTo(testTopicId);
        assertThat(topics.get(0).topicName()).isEqualTo(TEST_TOPIC_NAME);
        assertThat(topics.get(0).attempts()).isEqualTo(1);
        assertThat(topics.get(0).accuracy()).isEqualByComparingTo("100.0");
        // Deliberately no trend assertion: this endpoint stopped reporting a per-topic direction
        // in TASK-3001 (D3.1). It was a duplicate of user_topic_health.trend_direction with a
        // different window and evidence floor, so the two could disagree about the same student.
        // Direction now has exactly one owner, and GET /api/me/learning-state is where it is read.

        List<UserAnalyticsDtos.SubjectStat> subjects = subjects(token);
        assertThat(subjects).hasSize(1);
        assertThat(subjects.get(0).subjectName()).isEqualTo(TEST_SUBJECT_NAME);
        assertThat(subjects.get(0).practiceAccuracy()).isEqualByComparingTo("100.0");
        // Nothing was answered in a mock, so mock accuracy is absent — not 0%, which would read
        // as "tried and failed".
        assertThat(subjects.get(0).mockAccuracy()).isNull();
    }

    /* ============================================================= the two counting rules */

    /**
     * Running out of time on a timed paper is normal. Counting the questions a student never
     * reached as mistakes manufactures weakness out of the clock — the single easiest way to get
     * this whole feature wrong.
     */
    @Test
    void unattemptedMockQuestionsAreExcluded_notCountedWrong() {
        String token = signUp("analytics.unattempted@example.com");
        UUID answeredRight = createQuestion("easy");
        UUID answeredWrong = createQuestion("easy");
        UUID neverReached = createQuestion("easy");

        ProgressDtos.MockAttempt attempt = mockAttempt("mock-skips-" + UUID.randomUUID());
        attempt.setResults(List.of(
                mockResult(0, answeredRight, "CORRECT"),
                mockResult(1, answeredWrong, "INCORRECT"),
                mockResult(2, neverReached, "UNATTEMPTED")));

        ProgressDtos.SyncRequest request = new ProgressDtos.SyncRequest();
        request.setMockAttempts(List.of(attempt));
        upload(token, request);

        UserAnalyticsDtos.Overview overview = overview(token, null);
        assertThat(overview.totalQuestionsAttempted()).isEqualTo(2);
        assertThat(overview.totalCorrect()).isEqualTo(1);
        // 1 of 2 answered, not 1 of 3 offered.
        assertThat(overview.overallAccuracy()).isEqualByComparingTo("50.0");
    }

    /**
     * {@code time_ms} is nullable and absent means unmeasured. Averaging over every attempt
     * instead of over the timed ones invents a faster student than the data supports.
     */
    @Test
    void averageTimeDividesByTheAttemptsThatWereActuallyTimed() {
        String token = signUp("analytics.timing.avg@example.com");
        UUID timed = createQuestion("easy");
        UUID untimed = createQuestion("easy");

        ProgressDtos.PracticeSession session = session("session-avg-" + UUID.randomUUID(), 2, 2, timed);
        ProgressDtos.PracticeResult first = session.getResults().get(0);
        first.setTimeMs(40_000);
        ProgressDtos.PracticeResult second = new ProgressDtos.PracticeResult();
        second.setOrderIndex(1);
        second.setQuestionId(untimed);
        second.setSelectedIndex(0);
        second.setCorrectIndex(0);
        second.setCorrect(true);
        session.setResults(List.of(first, second));

        ProgressDtos.SyncRequest request = new ProgressDtos.SyncRequest();
        request.setPracticeSessions(List.of(session));
        upload(token, request);

        List<UserAnalyticsDtos.TopicStat> topics = topics(token);
        assertThat(topics).hasSize(1);
        assertThat(topics.get(0).attempts()).isEqualTo(2);
        // 40s over the one timed answer, not 20s over both.
        assertThat(topics.get(0).averageTimeMs()).isEqualTo(40_000L);
    }

    /* ==================================================================== endpoint behaviour */

    @Test
    void activityRejectsAnUnknownWindowRatherThanSilentlyDefaulting() {
        String token = signUp("analytics.window@example.com");

        ResponseEntity<Map> response = restTemplate.exchange(
                "/api/me/analytics/activity?window=LAST_FORTNIGHT", HttpMethod.GET, authed(token, null), Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void anUnknownTimeZoneIsRejected() {
        String token = signUp("analytics.zone@example.com");

        ResponseEntity<Map> response = restTemplate.exchange(
                "/api/me/analytics/overview?zone=Mars/Olympus_Mons", HttpMethod.GET, authed(token, null), Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void everyAnalyticsEndpointRequiresSigningIn() {
        for (String path : List.of("/overview", "/subjects", "/topics", "/difficulty", "/activity", "/trends")) {
            ResponseEntity<Map> response =
                    restTemplate.getForEntity("/api/me/analytics" + path, Map.class);
            assertThat(response.getStatusCode())
                    .as("unauthenticated %s", path)
                    .isEqualTo(HttpStatus.UNAUTHORIZED);
        }
    }

    /** A student with no history gets zeroes and nulls, never a crash and never a fabricated figure. */
    @Test
    void aBrandNewAccountGetsEmptyAnalyticsRatherThanAnError() {
        String token = signUp("analytics.empty@example.com");

        UserAnalyticsDtos.Overview overview = overview(token, null);
        assertThat(overview.totalQuestionsAttempted()).isZero();
        assertThat(overview.overallAccuracy()).isNull();
        assertThat(overview.lastActiveAt()).isNull();
        assertThat(overview.daysSinceLastActivity()).isNull();
        assertThat(overview.currentStreakDays()).isZero();

        assertThat(topics(token)).isEmpty();
        assertThat(subjects(token)).isEmpty();
        assertThat(difficulty(token)).isEmpty();
    }

    /** Activity in one day is a one-day streak, and today counts in the zone the caller asked for. */
    @Test
    void streakCountsTodayInTheRequestedZone() {
        String token = signUp("analytics.streak@example.com");

        ProgressDtos.SyncRequest request = new ProgressDtos.SyncRequest();
        request.setPracticeSessions(List.of(session("session-streak-" + UUID.randomUUID(), 3, 5, UUID.randomUUID())));
        upload(token, request);

        UserAnalyticsDtos.Overview overview = overview(token, "Asia/Kolkata");
        assertThat(overview.currentStreakDays()).isEqualTo(1);
        assertThat(overview.longestStreakDays()).isEqualTo(1);
        assertThat(overview.daysSinceLastActivity()).isZero();
    }

    /* ------------------------------------------------------------------------- helpers */

    private String signUp(String email) {
        RegisterRequest request = new RegisterRequest();
        request.setEmail(email);
        request.setPassword("analytics123");
        ResponseEntity<AuthResponse> response =
                restTemplate.postForEntity("/api/auth/register", request, AuthResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdEmails.add(email);
        return response.getBody().token();
    }

    private UUID createQuestion(String difficulty) {
        CreateQuestionRequest request = sampleRequest();
        request.setDifficulty(difficulty);
        ResponseEntity<QuestionResponse> response =
                restTemplate.postForEntity("/api/questions", adminAuth(request), QuestionResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        UUID id = response.getBody().getId();
        createdIds.add(id);
        return id;
    }

    private void retagDifficulty(UUID questionId, String difficulty) {
        UpdateQuestionRequest request = new UpdateQuestionRequest();
        request.setCorrectAnswer("A");
        request.setTopicId(testTopicId);
        request.setDifficulty(difficulty);
        request.setExamCodes(List.of(TEST_EXAM_CODE));
        ResponseEntity<QuestionResponse> response = restTemplate.exchange(
                "/api/questions/" + questionId, HttpMethod.PUT, adminAuth(request), QuestionResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().getDifficulty()).isEqualTo(difficulty);
    }

    private ProgressDtos.SyncResponse upload(String token, ProgressDtos.SyncRequest request) {
        ResponseEntity<ProgressDtos.SyncResponse> response = restTemplate.exchange(
                "/api/progress/sync", HttpMethod.POST, authed(token, request), ProgressDtos.SyncResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody();
    }

    private ProgressDtos.RestoreResponse restore(String token) {
        return restTemplate.exchange("/api/progress", HttpMethod.GET, authed(token, null),
                ProgressDtos.RestoreResponse.class).getBody();
    }

    private UserAnalyticsDtos.Overview overview(String token, String zone) {
        String url = "/api/me/analytics/overview" + (zone == null ? "" : "?zone=" + zone);
        ResponseEntity<UserAnalyticsDtos.Overview> response = restTemplate.exchange(
                url, HttpMethod.GET, authed(token, null), UserAnalyticsDtos.Overview.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody();
    }

    private List<UserAnalyticsDtos.TopicStat> topics(String token) {
        return restTemplate.exchange("/api/me/analytics/topics", HttpMethod.GET, authed(token, null),
                new ParameterizedTypeReference<List<UserAnalyticsDtos.TopicStat>>() { }).getBody();
    }

    private List<UserAnalyticsDtos.SubjectStat> subjects(String token) {
        return restTemplate.exchange("/api/me/analytics/subjects", HttpMethod.GET, authed(token, null),
                new ParameterizedTypeReference<List<UserAnalyticsDtos.SubjectStat>>() { }).getBody();
    }

    private List<UserAnalyticsDtos.DifficultyStat> difficulty(String token) {
        return restTemplate.exchange("/api/me/analytics/difficulty", HttpMethod.GET, authed(token, null),
                new ParameterizedTypeReference<List<UserAnalyticsDtos.DifficultyStat>>() { }).getBody();
    }

    private static ProgressDtos.PracticeSession session(String id, int correct, int total, UUID questionId) {
        ProgressDtos.PracticeSession session = new ProgressDtos.PracticeSession();
        session.setId(id);
        session.setCompletedAt(OffsetDateTime.now());
        session.setExamLabel("Automated Test Exam");
        session.setSubjectName(TEST_SUBJECT_NAME);
        session.setTopicName(TEST_TOPIC_NAME);
        session.setLevelLabel("Easy");
        session.setCorrectCount(correct);
        session.setTotalCount(total);

        ProgressDtos.PracticeResult result = new ProgressDtos.PracticeResult();
        result.setOrderIndex(0);
        result.setQuestionId(questionId);
        result.setSelectedIndex(0);
        result.setCorrectIndex(0);
        result.setCorrect(true);
        session.setResults(new ArrayList<>(List.of(result)));
        return session;
    }

    private static ProgressDtos.MockAttempt mockAttempt(String id) {
        ProgressDtos.MockAttempt attempt = new ProgressDtos.MockAttempt();
        attempt.setId(id);
        attempt.setExamCode(TEST_EXAM_CODE);
        attempt.setExamLabel("Automated Test Exam");
        attempt.setStartedAt(OffsetDateTime.now().minusMinutes(30));
        attempt.setCompletedAt(OffsetDateTime.now());
        attempt.setDurationSeconds(1800);
        attempt.setTimeTakenSeconds(1500);
        attempt.setMarksCorrect(new BigDecimal("2"));
        attempt.setMarksWrong(new BigDecimal("0.5"));
        attempt.setTotalMarksScored(new BigDecimal("1.5"));
        attempt.setCorrectCount(1);
        attempt.setWrongCount(1);
        attempt.setUnattemptedCount(1);
        attempt.setTotalQuestions(3);
        return attempt;
    }

    private static ProgressDtos.MockResult mockResult(int orderIndex, UUID questionId, String outcome) {
        ProgressDtos.MockResult result = new ProgressDtos.MockResult();
        result.setOrderIndex(orderIndex);
        result.setSubjectName(TEST_SUBJECT_NAME);
        result.setQuestionId(questionId);
        result.setQuestionType("SINGLE_CHOICE");
        result.setOutcome(outcome);
        result.setCorrectIndex(0);
        result.setSelectedIndex("UNATTEMPTED".equals(outcome) ? null : "CORRECT".equals(outcome) ? 0 : 1);
        return result;
    }

    private static <T> HttpEntity<T> authed(String token, T body) {
        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        return new HttpEntity<>(body, headers);
    }
}
