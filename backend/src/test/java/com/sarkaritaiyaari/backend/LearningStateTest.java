package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.AuthResponse;
import com.sarkaritaiyaari.backend.dto.CreateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.ExamTopicsRequest;
import com.sarkaritaiyaari.backend.dto.LearningStateDtos.LearningStateResponse;
import com.sarkaritaiyaari.backend.dto.LearningStateDtos.SubjectLearningState;
import com.sarkaritaiyaari.backend.dto.LearningStateDtos.TopicLearningState;
import com.sarkaritaiyaari.backend.dto.ProgressDtos;
import com.sarkaritaiyaari.backend.dto.QuestionResponse;
import com.sarkaritaiyaari.backend.dto.RegisterRequest;
import com.sarkaritaiyaari.backend.dto.SubjectRequest;
import com.sarkaritaiyaari.backend.dto.SubjectResponse;
import com.sarkaritaiyaari.backend.dto.TopicProgressDtos;
import com.sarkaritaiyaari.backend.dto.TopicRequest;
import com.sarkaritaiyaari.backend.dto.TopicResponse;
import com.sarkaritaiyaari.backend.dto.TranslationRequest;
import com.sarkaritaiyaari.backend.repository.ExamTopicRepository;
import com.sarkaritaiyaari.backend.repository.TopicPriorityRepository;
import com.sarkaritaiyaari.backend.repository.UserTopicHealthRepository;
import com.sarkaritaiyaari.backend.repository.UserTopicProgressRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
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
 * The canonical learning state (TASK-3001, Phase 3) end to end: real practice and mock attempts
 * uploaded through the real sync endpoints, real curriculum state uploaded through the real
 * topic-progress endpoint, read back through {@code GET /api/me/learning-state}.
 *
 * <p>What this class is really for is the property the whole phase exists to establish: <b>the two
 * per-topic state dimensions are separately readable, and cannot be confused with one another.</b>
 * Before this contract both were spelled {@code state} and both could be {@code NEEDS_REVISION},
 * meaning different things — a planner reading the bare string had an ambiguous input. The test
 * that matters most here constructs exactly that collision on purpose and proves a reader can
 * still tell the two apart.
 *
 * <p>The scoring itself is not re-tested here; {@code service.TopicHealthScoringTest} owns the
 * arithmetic and {@code WeaknessRadarTest} owns the evidence plumbing. This class covers the
 * joining: that each dimension arrives from its own producer, unchanged.
 */
class LearningStateTest extends AbstractIntegrationTest {

    @Autowired private ExamTopicRepository examTopicRepository;
    @Autowired private TopicPriorityRepository topicPriorityRepository;
    @Autowired private UserTopicHealthRepository userTopicHealthRepository;
    @Autowired private UserTopicProgressRepository userTopicProgressRepository;

    /** Unique per run, so a leftover row from a failed run cannot make a later run pass or fail. */
    private final String runId = UUID.randomUUID().toString().substring(0, 8);

    private final List<String> createdEmails = new ArrayList<>();

    @AfterEach
    void clearReferences() {
        for (UUID topicId : createdTopicIds) {
            userTopicHealthRepository.deleteByTopicId(topicId);
            userTopicProgressRepository.deleteByTopicId(topicId);
            topicPriorityRepository.deleteByTopicId(topicId);
            examTopicRepository.findByTopicId(topicId)
                    .forEach(row -> examTopicRepository.deleteById(row.getId()));
        }
        for (String examCode : createdExamCodes) {
            topicPriorityRepository.deleteByExamCode(examCode);
            examTopicRepository.deleteByExamCode(examCode);
        }
        createdEmails.forEach(email -> userRepository.findByEmail(email).ifPresent(userRepository::delete));
        createdEmails.clear();
    }

    /* ------------------------------------------------------------------------ access control */

    @Test
    void requiresASignedInUser() {
        Fixture fixture = examWithTopics("auth", 1);

        ResponseEntity<String> anonymous = restTemplate.getForEntity(
                "/api/me/learning-state?examCode=" + fixture.examCode, String.class);

        assertThat(anonymous.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void unknownExamIs404() {
        String token = signUp("state.unknown." + runId + "@example.com");

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/me/learning-state?examCode=NO_SUCH_" + runId,
                HttpMethod.GET, authed(token, null), String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    /* ------------------------------------------------- the point of the whole phase (D3.1) */

    /**
     * The decisive test. A topic is set up so that the two dimensions genuinely disagree:
     * <ul>
     *   <li>curriculum says NEEDS_REVISION — the device's own ladder, meaning "this was MASTERED
     *       and cumulative accuracy has since fallen below 60%";</li>
     *   <li>performance says something else entirely, computed from real recent attempts.</li>
     * </ul>
     * Both values arrive, under different names, and neither has overwritten the other. Before
     * this contract a consumer reading {@code state} could have got either one with no way to
     * know which.
     */
    @Test
    void theTwoStateDimensionsAreSeparatelyReadableEvenWhenBothCouldSayNeedsRevision() {
        Fixture fixture = examWithTopics("collision", 1);
        String token = signUp("state.collision." + runId + "@example.com");
        UUID topicId = fixture.topicIds.get(0);

        // The curriculum ladder, as the device would have uploaded it after a real regression.
        uploadCurriculum(token, topicId, "NEEDS_REVISION", 20, 11, "55.00");

        // Real, recent, all-correct practice — so the performance dimension is emphatically NOT
        // a regression. The two dimensions now genuinely disagree, which is the interesting case.
        List<UUID> questionIds = createQuestions(fixture, topicId, 6);
        upload(token, List.of(practiceSession("session-collide-" + runId, questionIds, 6, 1)));

        TopicLearningState topic = onlyTopic(state(token, fixture.examCode), topicId);

        assertThat(topic.curriculumState()).isEqualTo("NEEDS_REVISION");
        assertThat(topic.curriculumAttempts()).isEqualTo(20);
        assertThat(topic.curriculumAccuracy()).isEqualByComparingTo("55.00");

        // The performance dimension is present, independent, and does not agree — which is the
        // whole reason for keeping both. A single flattened label could not express this student.
        assertThat(topic.performanceState()).isNotNull();
        assertThat(topic.performanceState()).isNotEqualTo("NEEDS_REVISION");
        assertThat(topic.attempts()).isEqualTo(6);
        assertThat(topic.accuracy()).isEqualTo(100);
    }

    /**
     * The health model pools practice and mock evidence into one verdict, deliberately and
     * unchanged by this phase. The split is still readable as facts, so a later planner can treat
     * a rushed mock answer differently from an untimed practice answer without redefining health.
     */
    @Test
    void practiceAndMockAccuracyAreReadableSeparately() {
        Fixture fixture = examWithTopics("split", 1);
        String token = signUp("state.split." + runId + "@example.com");
        UUID topicId = fixture.topicIds.get(0);

        List<UUID> questionIds = createQuestions(fixture, topicId, 4);
        ProgressDtos.SyncRequest request = new ProgressDtos.SyncRequest();
        // Everything right when untimed, everything wrong under the clock.
        request.setPracticeSessions(List.of(
                practiceSession("session-split-" + runId, questionIds, 4, 1)));
        request.setMockAttempts(List.of(
                mockAttempt("mocktest-split-" + runId, questionIds, 0, 1)));
        postProgress(token, request);

        TopicLearningState topic = onlyTopic(state(token, fixture.examCode), topicId);

        assertThat(topic.practiceAccuracy()).isEqualByComparingTo("100.0");
        assertThat(topic.mockAccuracy()).isEqualByComparingTo("0.0");
        // The pooled figure is the average of the two, which is exactly what the health model
        // sees. Reporting only that would hide a student who knows the material and runs out of
        // time — the distinction a planner needs and cannot recover from one number.
        assertThat(topic.accuracy()).isEqualTo(50);
    }

    /* --------------------------------------------------------------------- null discipline */

    /**
     * A topic nobody has touched is NOT_STARTED — a real answer, never null. Its performance
     * dimension is null, which is different from INSUFFICIENT_DATA: the first means "never
     * measured", the second means "measured, not enough to judge".
     */
    @Test
    void anUntouchedTopicIsNotStartedWithNoPerformanceVerdict() {
        Fixture fixture = examWithTopics("fresh", 1);
        String token = signUp("state.fresh." + runId + "@example.com");

        TopicLearningState topic = onlyTopic(state(token, fixture.examCode), fixture.topicIds.get(0));

        assertThat(topic.curriculumState()).isEqualTo("NOT_STARTED");
        assertThat(topic.curriculumAttempts()).isZero();
        assertThat(topic.curriculumAccuracy()).isNull();
        assertThat(topic.performanceState()).isNull();
        assertThat(topic.healthScore()).isNull();
        assertThat(topic.trend()).isNull();
        assertThat(topic.attempts()).isZero();
    }

    /* ------------------------------------------------------------------- subject rollup (D3.8) */

    /**
     * §D3.8: a subject reports a distribution and a coverage pair, never one score. The pair is
     * the planning signal — "one of two topics started, but only 10 of 30 marks" is actionable in
     * a way an averaged percentage is not.
     */
    @Test
    void subjectRollupReportsDistributionAndWeightageCoverage() {
        Fixture fixture = examWithTopics("rollup", 2);
        String token = signUp("state.rollup." + runId + "@example.com");
        UUID started = fixture.topicIds.get(0);
        UUID untouched = fixture.topicIds.get(1);

        List<UUID> questionIds = createQuestions(fixture, started, 3);
        upload(token, List.of(practiceSession("session-rollup-" + runId, questionIds, 2, 1)));
        uploadCurriculum(token, started, "PRACTICING", 3, 2, "66.67");

        LearningStateResponse response = state(token, fixture.examCode);
        assertThat(response.subjects()).hasSize(1);
        SubjectLearningState subject = response.subjects().get(0);

        assertThat(subject.topicsInSyllabus()).isEqualTo(2);
        assertThat(subject.topicsStarted()).isEqualTo(1);
        assertThat(subject.topicsWithEvidence()).isEqualTo(1);
        assertThat(subject.curriculumCounts()).containsEntry("PRACTICING", 1);
        assertThat(subject.curriculumCounts()).containsEntry("NOT_STARTED", 1);
        // The untouched topic contributes nothing to the performance distribution rather than
        // being counted as some state it was never measured to be in.
        assertThat(sum(subject.performanceCounts())).isEqualTo(1);

        // Both topics were mapped at 10% each by the fixture; one of them has been started.
        assertThat(subject.weightagePercentTotal()).isEqualByComparingTo("20.00");
        assertThat(subject.weightagePercentStarted()).isEqualByComparingTo("10.00");

        assertThat(untouched).isNotEqualTo(started);
    }

    /* ----------------------------------------------------------------- one owner per dimension */

    /**
     * Direction has exactly one producer after this phase. {@code /api/me/analytics/topics} used
     * to compute its own per-topic trend over a different window with a different evidence floor,
     * so the two could disagree about the same student and topic; that field is gone, and this
     * asserts the surviving one is the health model's.
     */
    @Test
    void trendComesFromTheHealthModelAndAnalyticsNoLongerReportsOne() {
        Fixture fixture = examWithTopics("trend", 1);
        String token = signUp("state.trend." + runId + "@example.com");
        UUID topicId = fixture.topicIds.get(0);

        List<UUID> questionIds = createQuestions(fixture, topicId, 5);
        upload(token, List.of(practiceSession("session-trend-" + runId, questionIds, 3, 1)));

        TopicLearningState topic = onlyTopic(state(token, fixture.examCode), topicId);

        // One session cannot establish a direction, and the health model's vocabulary for that is
        // NOT_ENOUGH_DATA. The analytics endpoint's now-deleted duplicate said INSUFFICIENT_DATA
        // for the same situation — two spellings of one idea was exactly the drift being closed.
        assertThat(topic.trend()).isEqualTo("NOT_ENOUGH_DATA");
        assertThat(topic.evidenceLevel()).isNotNull();

        // The analytics payload must no longer carry a per-topic trend at all. Asserted against
        // the raw JSON because a removed record component cannot be referenced from Java.
        ResponseEntity<String> analytics = restTemplate.exchange(
                "/api/me/analytics/topics", HttpMethod.GET, authed(token, null), String.class);
        assertThat(analytics.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(analytics.getBody()).doesNotContain("\"trend\"");
    }

    /* ---------------------------------------------------------------------------- scoping */

    /** One student cannot read another's state: there is no parameter that would name one. */
    @Test
    void stateIsScopedToTheCallingStudent() {
        Fixture fixture = examWithTopics("scope", 1);
        String owner = signUp("state.owner." + runId + "@example.com");
        String other = signUp("state.other." + runId + "@example.com");
        UUID topicId = fixture.topicIds.get(0);

        List<UUID> questionIds = createQuestions(fixture, topicId, 4);
        upload(owner, List.of(practiceSession("session-scope-" + runId, questionIds, 4, 1)));
        uploadCurriculum(owner, topicId, "PRACTICING", 4, 4, "100.00");

        TopicLearningState mine = onlyTopic(state(owner, fixture.examCode), topicId);
        TopicLearningState theirs = onlyTopic(state(other, fixture.examCode), topicId);

        assertThat(mine.curriculumState()).isEqualTo("PRACTICING");
        assertThat(mine.attempts()).isEqualTo(4);

        assertThat(theirs.curriculumState()).isEqualTo("NOT_STARTED");
        assertThat(theirs.attempts()).isZero();
        assertThat(theirs.performanceState()).isNull();
    }

    /* ------------------------------------------------------------------------------ helpers */

    private record Fixture(String examCode, UUID subjectId, List<UUID> topicIds) {
    }

    private static int sum(Map<String, Integer> counts) {
        return counts.values().stream().mapToInt(Integer::intValue).sum();
    }

    private LearningStateResponse state(String token, String examCode) {
        ResponseEntity<LearningStateResponse> response = restTemplate.exchange(
                "/api/me/learning-state?examCode=" + examCode,
                HttpMethod.GET, authed(token, null), LearningStateResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody();
    }

    private static TopicLearningState onlyTopic(LearningStateResponse response, UUID topicId) {
        return response.topics().stream()
                .filter(t -> t.topicId().equals(topicId))
                .findFirst()
                .orElseThrow(() -> new AssertionError("topic " + topicId + " missing from state"));
    }

    /** An inactive exam with its own subject and {@code count} mapped topics, unique to this run. */
    private Fixture examWithTopics(String suffix, int count) {
        String code = ("STATE_" + suffix + "_" + runId).toUpperCase();
        Map<String, Object> examPayload = Map.of(
                "code", code, "name", "State " + suffix + " " + runId,
                "active", false, "displayOrder", 996);
        ResponseEntity<Map> exam = restTemplate.postForEntity(
                "/api/exams", adminAuth(examPayload), Map.class);
        assertThat(exam.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdExamCodes.add(code);

        SubjectRequest subjectRequest = new SubjectRequest();
        subjectRequest.setName("State " + suffix + " Subject " + runId);
        ResponseEntity<SubjectResponse> subject = restTemplate.postForEntity(
                "/api/subjects", adminAuth(subjectRequest), SubjectResponse.class);
        assertThat(subject.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        UUID subjectId = subject.getBody().getId();
        createdSubjectIds.add(subjectId);

        List<UUID> topicIds = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            topicIds.add(createTopic(subjectId, "State " + suffix + " Topic " + i));
        }
        mapTopics(code, topicIds);
        return new Fixture(code, subjectId, topicIds);
    }

    private UUID createTopic(UUID subjectId, String name) {
        TopicRequest request = new TopicRequest();
        request.setSubjectId(subjectId);
        request.setName(name + " " + runId);
        request.setDisplayOrder(1);
        ResponseEntity<TopicResponse> response = restTemplate.postForEntity(
                "/api/topics", adminAuth(request), TopicResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        UUID id = response.getBody().getId();
        createdTopicIds.add(id);
        return id;
    }

    private void mapTopics(String examCode, List<UUID> topicIds) {
        List<ExamTopicsRequest.Entry> entries = new ArrayList<>();
        for (UUID topicId : topicIds) {
            ExamTopicsRequest.Entry entry = new ExamTopicsRequest.Entry();
            entry.setTopicId(topicId);
            entry.setWeightagePercent(new BigDecimal("10.00"));
            entries.add(entry);
        }
        ExamTopicsRequest request = new ExamTopicsRequest();
        request.setTopics(entries);
        ResponseEntity<List> response = restTemplate.exchange(
                "/api/exams/" + examCode + "/topics", HttpMethod.PUT, adminAuth(request), List.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    private List<UUID> createQuestions(Fixture fixture, UUID topicId, int count) {
        List<UUID> ids = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            CreateQuestionRequest request = new CreateQuestionRequest();
            request.setCorrectAnswer("A");
            request.setTopicId(topicId);
            request.setDifficulty("medium");
            request.setExamCodes(List.of(fixture.examCode));
            TranslationRequest en = new TranslationRequest();
            en.setLanguageCode("en");
            en.setQuestionText("State fixture question " + runId + " #" + i + " for " + topicId);
            en.setOptions(List.of("One", "Two", "Three", "Four"));
            en.setExplanation("Because.");
            request.setTranslations(List.of(en));

            ResponseEntity<QuestionResponse> response = restTemplate.postForEntity(
                    "/api/questions", adminAuth(request), QuestionResponse.class);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
            createdIds.add(response.getBody().getId());
            ids.add(response.getBody().getId());
        }
        return ids;
    }

    private ProgressDtos.PracticeSession practiceSession(String id, List<UUID> questionIds,
                                                          int correct, int daysAgo) {
        ProgressDtos.PracticeSession session = new ProgressDtos.PracticeSession();
        session.setId(id);
        session.setCompletedAt(OffsetDateTime.now().minusDays(daysAgo));
        session.setTotalCount(questionIds.size());
        session.setCorrectCount(correct);
        List<ProgressDtos.PracticeResult> results = new ArrayList<>();
        for (int i = 0; i < questionIds.size(); i++) {
            ProgressDtos.PracticeResult r = new ProgressDtos.PracticeResult();
            r.setOrderIndex(i);
            r.setQuestionId(questionIds.get(i));
            r.setCorrectIndex(0);
            r.setSelectedIndex(i < correct ? 0 : 1);
            r.setCorrect(i < correct);
            results.add(r);
        }
        session.setResults(results);
        return session;
    }

    private ProgressDtos.MockAttempt mockAttempt(String id, List<UUID> questionIds,
                                                  int correct, int daysAgo) {
        ProgressDtos.MockAttempt attempt = new ProgressDtos.MockAttempt();
        attempt.setId(id);
        attempt.setExamCode(null);
        attempt.setStartedAt(OffsetDateTime.now().minusDays(daysAgo).minusMinutes(30));
        attempt.setCompletedAt(OffsetDateTime.now().minusDays(daysAgo));
        attempt.setTotalQuestions(questionIds.size());
        attempt.setCorrectCount(correct);
        attempt.setWrongCount(questionIds.size() - correct);
        attempt.setUnattemptedCount(0);
        List<ProgressDtos.MockResult> results = new ArrayList<>();
        for (int i = 0; i < questionIds.size(); i++) {
            ProgressDtos.MockResult r = new ProgressDtos.MockResult();
            r.setOrderIndex(i);
            r.setQuestionId(questionIds.get(i));
            r.setCorrectIndex(0);
            r.setSelectedIndex(i < correct ? 0 : 1);
            results.add(r);
        }
        attempt.setResults(results);
        return attempt;
    }

    /** The real device-side ladder, uploaded through the real endpoint rather than written direct. */
    private void uploadCurriculum(String token, UUID topicId, String state,
                                   int attempted, int correct, String accuracyPercent) {
        TopicProgressDtos.TopicProgress row = new TopicProgressDtos.TopicProgress();
        row.setTopicId(topicId);
        row.setState(state);
        row.setAttemptedCount(attempted);
        row.setCorrectCount(correct);
        row.setAccuracyPercent(new BigDecimal(accuracyPercent));
        row.setTotalTimeMs(0);
        row.setLastPracticedAt(OffsetDateTime.now().minusDays(1));
        row.setUpdatedAt(OffsetDateTime.now());

        TopicProgressDtos.SyncRequest request = new TopicProgressDtos.SyncRequest();
        request.setTopics(List.of(row));
        ResponseEntity<TopicProgressDtos.SyncResponse> response = restTemplate.exchange(
                "/api/topic-progress/sync", HttpMethod.POST, authed(token, request),
                TopicProgressDtos.SyncResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().stored()).isEqualTo(1);
    }

    private void upload(String token, List<ProgressDtos.PracticeSession> sessions) {
        ProgressDtos.SyncRequest request = new ProgressDtos.SyncRequest();
        request.setPracticeSessions(sessions);
        postProgress(token, request);
    }

    private void postProgress(String token, ProgressDtos.SyncRequest request) {
        ResponseEntity<ProgressDtos.SyncResponse> response = restTemplate.exchange(
                "/api/progress/sync", HttpMethod.POST, authed(token, request),
                ProgressDtos.SyncResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    private String signUp(String email) {
        RegisterRequest request = new RegisterRequest();
        request.setEmail(email);
        request.setPassword("State@12345");
        ResponseEntity<AuthResponse> response = restTemplate.postForEntity(
                "/api/auth/register", request, AuthResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdEmails.add(email);
        return response.getBody().token();
    }

    private <T> HttpEntity<T> authed(String token, T body) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + token);
        return new HttpEntity<>(body, headers);
    }
}
