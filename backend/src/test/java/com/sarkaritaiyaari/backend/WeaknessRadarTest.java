package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.AuthResponse;
import com.sarkaritaiyaari.backend.dto.CreateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.ExamTopicsRequest;
import com.sarkaritaiyaari.backend.dto.ProgressDtos;
import com.sarkaritaiyaari.backend.dto.QuestionResponse;
import com.sarkaritaiyaari.backend.dto.RegisterRequest;
import com.sarkaritaiyaari.backend.dto.SubjectRequest;
import com.sarkaritaiyaari.backend.dto.SubjectResponse;
import com.sarkaritaiyaari.backend.dto.TopicRequest;
import com.sarkaritaiyaari.backend.dto.TopicResponse;
import com.sarkaritaiyaari.backend.dto.TranslationRequest;
import com.sarkaritaiyaari.backend.dto.WeaknessRadarDtos.AdminRadarResponse;
import com.sarkaritaiyaari.backend.dto.WeaknessRadarDtos.RadarTopic;
import com.sarkaritaiyaari.backend.dto.WeaknessRadarDtos.WeaknessRadarResponse;
import com.sarkaritaiyaari.backend.entity.TopicPriority;
import com.sarkaritaiyaari.backend.repository.ExamTopicRepository;
import com.sarkaritaiyaari.backend.repository.TopicPriorityRepository;
import com.sarkaritaiyaari.backend.repository.UserTopicHealthRepository;
import com.sarkaritaiyaari.backend.service.TopicHealthService;
import com.sarkaritaiyaari.backend.service.TopicIntelligenceService;
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
 * Weakness Radar end to end: real attempts uploaded through the real sync endpoint, read back
 * through the real radar endpoint (TASK-2201).
 *
 * <p>The algorithm itself is covered by {@code service.TopicHealthScoringTest}, which is a
 * plain unit test over deterministic fixtures — the arithmetic does not need a database. What
 * this class covers is everything that only shows up when the pieces are joined: that the
 * evidence query actually finds the topic behind a question id, that an unattempted mock
 * question is not counted as a mistake, that the cache is reused and invalidated when it
 * should be, that a recompute leaves the raw attempts untouched, that exam priority changes
 * the ranking, and that the endpoints are scoped to the right caller.
 */
class WeaknessRadarTest extends AbstractIntegrationTest {

    @Autowired private ExamTopicRepository examTopicRepository;
    @Autowired private TopicPriorityRepository topicPriorityRepository;
    @Autowired private UserTopicHealthRepository userTopicHealthRepository;

    /** Unique per run, so a leftover row from a failed run cannot make a later run pass or fail. */
    private final String runId = UUID.randomUUID().toString().substring(0, 8);

    private final List<String> createdEmails = new ArrayList<>();

    /**
     * None of these tables cascade from topics or exams in a way the base class's deletes would
     * satisfy, so the referencing rows are cleared here. JUnit runs a subclass {@code @AfterEach}
     * before the superclass one, which is what makes this enough — the same arrangement
     * {@code EpicLIntelligenceTest} and {@code TopicModelTest} already use.
     */
    @AfterEach
    void clearRadarReferences() {
        for (UUID topicId : createdTopicIds) {
            userTopicHealthRepository.deleteByTopicId(topicId);
            topicPriorityRepository.deleteByTopicId(topicId);
            examTopicRepository.findByTopicId(topicId)
                    .forEach(row -> examTopicRepository.deleteById(row.getId()));
        }
        for (String examCode : createdExamCodes) {
            topicPriorityRepository.deleteByExamCode(examCode);
            examTopicRepository.deleteByExamCode(examCode);
        }
        // Health rows and progress both cascade from the user (V6, V24), so deleting the user
        // is enough for those.
        createdEmails.forEach(email -> userRepository.findByEmail(email).ifPresent(userRepository::delete));
        createdEmails.clear();
    }

    /* ------------------------------------------------------------------------ access control */

    @Test
    void radarRequiresASignedInUser() {
        Fixture fixture = examWithOneMappedTopic("auth");

        ResponseEntity<String> anonymous = restTemplate.getForEntity(
                "/api/exams/" + fixture.examCode + "/weakness-radar", String.class);

        // Unlike its neighbours under /api/exams/{code}, this one reads a specific student's
        // practice history — so it must not be public the way topic-intelligence is.
        assertThat(anonymous.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void unknownExamIs404() {
        String token = signUp("radar.unknown." + runId + "@example.com");

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/exams/NO_SUCH_EXAM_" + runId + "/weakness-radar",
                HttpMethod.GET, authed(token, null), String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    /* -------------------------------------------------------------------------- §21 new student */

    /**
     * §21's first edge case: a brand-new student must get a useful onboarding state, not a list
     * of weaknesses they have done nothing to earn.
     */
    @Test
    void aNewStudentGetsAnOnboardingStateRatherThanWeaknesses() {
        Fixture fixture = examWithOneMappedTopic("new");
        // Questions must exist for this to be the "no evidence yet" case rather than the
        // "nothing to practise" case — those are two different findings with two different
        // recommendations, and the empty-bank one is asserted separately below.
        createQuestions(fixture, 4, "medium", false);
        String token = signUp("radar.new." + runId + "@example.com");

        WeaknessRadarResponse radar = radar(token, fixture.examCode);

        assertThat(radar.overview().status()).isEqualTo("NO_DATA");
        assertThat(radar.overview().topicsWithEvidence()).isZero();
        assertThat(radar.overview().needsAttentionCount()).isZero();
        // The topic still appears — "you have not started this" is a finding, and hiding it
        // would make the syllabus look smaller than it is.
        assertThat(radar.topics()).hasSize(1);
        RadarTopic topic = radar.topics().get(0);
        assertThat(topic.state()).isEqualTo("INSUFFICIENT_DATA");
        assertThat(topic.evidenceLevel()).isEqualTo("INSUFFICIENT_DATA");
        assertThat(topic.recommendedAction().primary()).isEqualTo("GATHER_EVIDENCE");
        assertThat(topic.reasonCodes()).contains("NOT_ENOUGH_PRACTICE");
        // §9/§21: no timing data anywhere, so no speed claim of any kind.
        assertThat(topic.speedAvailable()).isFalse();
    }

    /* ------------------------------------------------------------- the join that makes it work */

    /**
     * The load-bearing integration: neither result table stores a topic, so the whole feature
     * depends on joining {@code question_id} through to {@code questions.topic_id}. If that
     * join is wrong, every topic reports INSUFFICIENT_DATA forever and the feature looks like
     * it works.
     */
    @Test
    void uploadedPracticeIsAttributedToTheRightTopicAndProducesAnAction() {
        Fixture fixture = examWithOneMappedTopic("diag");
        List<UUID> questionIds = createQuestions(fixture, 6, "medium", false);
        String token = signUp("radar.diag." + runId + "@example.com");

        // Five weak sessions, all inside the recent window: enough evidence to assert
        // something, and weak enough that it should be asserted.
        List<ProgressDtos.PracticeSession> sessions = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            sessions.add(practiceSession("radar-" + runId + "-" + i, questionIds, 2, i * 3 + 1));
        }
        upload(token, sessions, List.of());

        WeaknessRadarResponse radar = radar(token, fixture.examCode);

        assertThat(radar.algorithmVersion()).isEqualTo(TopicHealthService.ALGORITHM_VERSION);
        assertThat(radar.overview().topicsWithEvidence()).isEqualTo(1);
        RadarTopic topic = radar.topics().get(0);
        assertThat(topic.topicId()).isEqualTo(fixture.topicId);
        assertThat(topic.attemptedCount()).isEqualTo(30);
        assertThat(topic.correctCount()).isEqualTo(10);
        assertThat(topic.evidenceLevel()).isEqualTo("RELIABLE");
        assertThat(topic.state()).isEqualTo("NEEDS_ATTENTION");
        assertThat(topic.accuracyPercent()).isEqualTo(33);
        assertThat(topic.questionCount()).isGreaterThan(0);
        // §14: the action is the output that matters, and it must be actionable.
        assertThat(topic.recommendedAction().steps()).isNotEmpty();
        assertThat(topic.recommendedAction().primary()).isNotEqualTo("GATHER_EVIDENCE");
        // §18: no raw confidence and no false precision reaches the student payload.
        assertThat(topic.explanation()).isNotBlank();
    }

    /**
     * A mock question left unattempted must not be evidence of anything.
     *
     * <p>The single easiest way to get this feature wrong: counting skipped questions as wrong
     * manufactures weaknesses out of a student running out of time on a mock test.
     */
    @Test
    void unattemptedMockQuestionsAreNotCountedAsWrong() {
        Fixture fixture = examWithOneMappedTopic("mock");
        List<UUID> questionIds = createQuestions(fixture, 10, "medium", false);
        String token = signUp("radar.mock." + runId + "@example.com");

        // Ten questions: six answered correctly, four left blank.
        ProgressDtos.MockAttempt attempt = new ProgressDtos.MockAttempt();
        attempt.setId("radar-mock-" + runId);
        attempt.setExamCode(fixture.examCode);
        attempt.setExamLabel("Radar Mock");
        attempt.setStartedAt(OffsetDateTime.now().minusDays(2).minusHours(1));
        attempt.setCompletedAt(OffsetDateTime.now().minusDays(2));
        attempt.setDurationSeconds(3600);
        attempt.setTimeTakenSeconds(1800);
        attempt.setTotalQuestions(10);
        attempt.setCorrectCount(6);
        attempt.setUnattemptedCount(4);
        List<ProgressDtos.MockResult> results = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            ProgressDtos.MockResult r = new ProgressDtos.MockResult();
            r.setOrderIndex(i);
            r.setQuestionId(questionIds.get(i));
            r.setCorrectIndex(0);
            r.setSelectedIndex(i < 6 ? 0 : null); // null = never answered
            results.add(r);
        }
        attempt.setResults(results);
        upload(token, List.of(), List.of(attempt));

        RadarTopic topic = radar(token, fixture.examCode).topics().get(0);

        assertThat(topic.attemptedCount()).as("only answered questions are evidence").isEqualTo(6);
        assertThat(topic.correctCount()).isEqualTo(6);
        assertThat(topic.accuracyPercent()).as("6 of 6 answered, not 6 of 10").isEqualTo(100);
    }

    /* --------------------------------------------------------------------------- §20 caching */

    @Test
    void cachedHealthIsReusedUntilNewPracticeArrives() {
        Fixture fixture = examWithOneMappedTopic("cache");
        List<UUID> questionIds = createQuestions(fixture, 6, "medium", false);
        String token = signUp("radar.cache." + runId + "@example.com");
        upload(token, List.of(practiceSession("radar-cache-" + runId, questionIds, 3, 1)), List.of());

        OffsetDateTime first = radar(token, fixture.examCode).computedAt();
        OffsetDateTime second = radar(token, fixture.examCode).computedAt();

        assertThat(first).isNotNull();
        // §20: reading the radar twice must not rescan the attempt history twice.
        assertThat(second).isEqualTo(first);

        // A new session is new evidence, so the next read must notice without being told.
        upload(token, List.of(practiceSession("radar-cache2-" + runId, questionIds, 6, 0)), List.of());
        WeaknessRadarResponse afterNewPractice = radar(token, fixture.examCode);

        assertThat(afterNewPractice.computedAt()).isAfter(first);
        assertThat(afterNewPractice.topics().get(0).attemptedCount()).isEqualTo(12);
    }

    /**
     * §19 / §23.15 — recomputing derived health must leave the raw attempts byte-identical.
     *
     * <p>This is the property that makes a future algorithm v2 a code change rather than a data
     * migration: if a recompute could touch the history it was derived from, no formula change
     * would ever be reversible.
     */
    @Test
    void recomputingDoesNotAlterTheRawAttempts() {
        Fixture fixture = examWithOneMappedTopic("recompute");
        List<UUID> questionIds = createQuestions(fixture, 6, "medium", false);
        String token = signUp("radar.recompute." + runId + "@example.com");
        upload(token, List.of(practiceSession("radar-rc-" + runId, questionIds, 4, 1)), List.of());

        ProgressDtos.RestoreResponse before = restore(token);
        radar(token, fixture.examCode);

        ResponseEntity<WeaknessRadarResponse> recomputed = restTemplate.exchange(
                "/api/exams/" + fixture.examCode + "/weakness-radar/recompute",
                HttpMethod.POST, authed(token, null), WeaknessRadarResponse.class);
        assertThat(recomputed.getStatusCode()).isEqualTo(HttpStatus.OK);

        ProgressDtos.RestoreResponse after = restore(token);

        assertThat(after.practiceSessions()).hasSameSizeAs(before.practiceSessions());
        assertThat(after.practiceSessions().get(0).getResults())
                .hasSameSizeAs(before.practiceSessions().get(0).getResults());
        assertThat(after.practiceSessions().get(0).getCorrectCount())
                .isEqualTo(before.practiceSessions().get(0).getCorrectCount());
        for (int i = 0; i < after.practiceSessions().get(0).getResults().size(); i++) {
            assertThat(after.practiceSessions().get(0).getResults().get(i).getQuestionId())
                    .isEqualTo(before.practiceSessions().get(0).getResults().get(i).getQuestionId());
            assertThat(after.practiceSessions().get(0).getResults().get(i).isCorrect())
                    .isEqualTo(before.practiceSessions().get(0).getResults().get(i).isCorrect());
        }
        // Recomputing twice is idempotent, because the inputs are immutable history.
        assertThat(recomputed.getBody().topics().get(0).attemptedCount()).isEqualTo(6);
    }

    /* ------------------------------------------------------------------- §13 / §23.11 priority */

    /**
     * §13 and §23.11 — exam priority changes which weakness is worth fixing first.
     *
     * <p>Two topics, deliberately given the <em>same</em> weak evidence, so the only thing that
     * can separate them is the exam's own priority. Epic L's {@code topic_priority} rows are
     * written directly here rather than by running its recompute: that service derives priority
     * from PYQ tagging and curated weightage, and reproducing a whole intelligence fixture would
     * test Epic L rather than this.
     */
    @Test
    void examPriorityRanksTheHigherValueFixFirst() {
        Fixture fixture = examWithOneMappedTopic("priority");
        UUID lowValueTopic = createTopic(fixture.subjectId, "Radar Low Value Topic");
        mapTopics(fixture.examCode, List.of(fixture.topicId, lowValueTopic));

        List<UUID> highQuestions = createQuestions(fixture, 6, "medium", false);
        List<UUID> lowQuestions = createQuestions(
                new Fixture(fixture.examCode, fixture.subjectId, lowValueTopic), 6, "medium", false);

        givePriority(fixture.examCode, fixture.topicId, "94.00");
        givePriority(fixture.examCode, lowValueTopic, "32.00");

        String token = signUp("radar.priority." + runId + "@example.com");
        List<ProgressDtos.PracticeSession> sessions = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            sessions.add(practiceSession("radar-hp-" + runId + "-" + i, highQuestions, 2, i * 3 + 1));
            sessions.add(practiceSession("radar-lp-" + runId + "-" + i, lowQuestions, 2, i * 3 + 1));
        }
        upload(token, sessions, List.of());

        WeaknessRadarResponse radar = radar(token, fixture.examCode);
        List<RadarTopic> needsAttention = radar.topics().stream()
                .filter(t -> t.state().equals("NEEDS_ATTENTION"))
                .toList();

        assertThat(needsAttention).hasSize(2);
        RadarTopic first = needsAttention.get(0);
        RadarTopic second = needsAttention.get(1);

        // Identical evidence, so identical health — the ordering is entirely priority's doing.
        assertThat(first.healthScore()).isEqualTo(second.healthScore());
        assertThat(first.topicId()).as("the high-priority topic must rank first")
                .isEqualTo(fixture.topicId);
        assertThat(first.interventionValue()).isGreaterThan(second.interventionValue());
        assertThat(first.reasonCodes()).contains("HIGH_EXAM_WEIGHT");
        assertThat(second.reasonCodes()).doesNotContain("HIGH_EXAM_WEIGHT");
    }

    /**
     * A topic with nothing to practise must not be told to practise.
     *
     * <p>The same guard {@code PreparePlanService} carries, for the same reason: it was found
     * on a device, where a "priority" topic opened an empty question screen.
     */
    @Test
    void aTopicWithNoQuestionsIsNotToldToPractise() {
        Fixture fixture = examWithOneMappedTopic("empty");
        String token = signUp("radar.empty." + runId + "@example.com");

        RadarTopic topic = radar(token, fixture.examCode).topics().get(0);

        assertThat(topic.questionCount()).isZero();
        assertThat(topic.reasonCodes()).contains("NO_QUESTIONS_AVAILABLE");
        assertThat(topic.recommendedAction().steps())
                .allSatisfy(step -> assertThat(step.action()).isEqualTo("LEARN_CONCEPT"));
    }

    /* ------------------------------------------------------------------------- §22 admin view */

    @Test
    void theAdminEvidenceViewIsAdminOnlyAndShowsTheFullWorking() {
        Fixture fixture = examWithOneMappedTopic("admin");
        List<UUID> questionIds = createQuestions(fixture, 6, "medium", false);
        String email = "radar.admin." + runId + "@example.com";
        String token = signUp(email);
        List<ProgressDtos.PracticeSession> sessions = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            sessions.add(practiceSession("radar-adm-" + runId + "-" + i, questionIds, 2, i * 3 + 1));
        }
        upload(token, sessions, List.of());
        radar(token, fixture.examCode); // populate the cache the admin view reads

        String path = "/api/admin/weakness-radar?email=" + email + "&examCode=" + fixture.examCode;

        assertThat(restTemplate.getForEntity(path, String.class).getStatusCode())
                .isEqualTo(HttpStatus.UNAUTHORIZED);
        // A signed-in student must not be able to read anyone's evidence, including their own,
        // through the admin path.
        assertThat(restTemplate.exchange(path, HttpMethod.GET, sharedStudentAuth(), String.class)
                .getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);

        ResponseEntity<AdminRadarResponse> response = restTemplate.exchange(
                path, HttpMethod.GET, adminAuth(), AdminRadarResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        AdminRadarResponse body = response.getBody();
        assertThat(body).isNotNull();
        assertThat(body.algorithmVersion()).isEqualTo(TopicHealthService.ALGORITHM_VERSION);
        assertThat(body.latestAttemptAt()).isNotNull();
        assertThat(body.topics()).hasSize(1);
        var audited = body.topics().get(0);
        // §22's whole point: the evidence has to be inspectable, including the parts the
        // student-facing payload deliberately withholds.
        assertThat(audited.confidenceScore()).isNotNull();
        assertThat(audited.healthScore()).isNotNull();
        assertThat(audited.attemptedCount()).isEqualTo(30);
        assertThat(audited.recommendedAction()).isNotBlank();
        assertThat(audited.inputs()).containsKeys("components", "droppedComponents", "confidenceFactors");
        // The absent speed signal must be visible AS absent, with its reason recorded.
        assertThat(audited.speedRatio()).isNull();
        @SuppressWarnings("unchecked")
        Map<String, Object> dropped = (Map<String, Object>) audited.inputs().get("droppedComponents");
        assertThat(dropped).containsKey("speed");
    }

    /* ------------------------------------------------------------------------------ fixtures */

    private record Fixture(String examCode, UUID subjectId, UUID topicId) {
    }

    /** An inactive exam with its own subject and one mapped topic, unique to this run. */
    private Fixture examWithOneMappedTopic(String suffix) {
        String code = ("RADAR_" + suffix + "_" + runId).toUpperCase();
        Map<String, Object> examPayload = Map.of(
                "code", code, "name", "Radar " + suffix + " " + runId,
                "active", false, "displayOrder", 997);
        ResponseEntity<Map> exam = restTemplate.postForEntity(
                "/api/exams", adminAuth(examPayload), Map.class);
        assertThat(exam.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdExamCodes.add(code);

        SubjectRequest subjectRequest = new SubjectRequest();
        subjectRequest.setName("Radar " + suffix + " Subject " + runId);
        ResponseEntity<SubjectResponse> subject = restTemplate.postForEntity(
                "/api/subjects", adminAuth(subjectRequest), SubjectResponse.class);
        assertThat(subject.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        UUID subjectId = subject.getBody().getId();
        createdSubjectIds.add(subjectId);

        UUID topicId = createTopic(subjectId, "Radar " + suffix + " Topic");
        mapTopics(code, List.of(topicId));
        return new Fixture(code, subjectId, topicId);
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

    private List<UUID> createQuestions(Fixture fixture, int count, String difficulty, boolean pyq) {
        List<UUID> ids = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            CreateQuestionRequest request = new CreateQuestionRequest();
            request.setCorrectAnswer("A");
            request.setTopicId(fixture.topicId);
            request.setDifficulty(difficulty);
            request.setExamCodes(List.of(fixture.examCode));
            request.setPyq(pyq);
            if (pyq) request.setPyqYear(2023);
            TranslationRequest en = new TranslationRequest();
            en.setLanguageCode("en");
            en.setQuestionText("Radar fixture question " + runId + " #" + i + " for " + fixture.topicId);
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

    /** One practice session answering every supplied question, {@code correct} of them right. */
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
            // Deliberately left null: no client records this yet, and the point of the field
            // is that its absence must not become a speed signal.
            results.add(r);
        }
        session.setResults(results);
        return session;
    }

    private void givePriority(String examCode, UUID topicId, String priority) {
        TopicPriority row = new TopicPriority();
        row.setId(TopicPriority.idFor(examCode, topicId, TopicIntelligenceService.ALGORITHM_VERSION));
        row.setExam(examRepository.findById(examCode).orElseThrow());
        row.setTopic(topicRepository.findById(topicId).orElseThrow());
        row.setAlgorithmVersion(TopicIntelligenceService.ALGORITHM_VERSION);
        row.setSystemPriority(new BigDecimal(priority));
        // finalPriority = coalesce(override, system) is asserted by a CHECK in V15, so this
        // fixture has to honour the same invariant a real recompute would.
        row.setFinalPriority(new BigDecimal(priority));
        row.setComputedAt(OffsetDateTime.now());
        topicPriorityRepository.save(row);
    }

    /* -------------------------------------------------------------------------------- calls */

    private WeaknessRadarResponse radar(String token, String examCode) {
        ResponseEntity<WeaknessRadarResponse> response = restTemplate.exchange(
                "/api/exams/" + examCode + "/weakness-radar", HttpMethod.GET,
                authed(token, null), WeaknessRadarResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody()).isNotNull();
        return response.getBody();
    }

    private void upload(String token, List<ProgressDtos.PracticeSession> sessions,
                         List<ProgressDtos.MockAttempt> attempts) {
        ProgressDtos.SyncRequest request = new ProgressDtos.SyncRequest();
        request.setPracticeSessions(sessions);
        request.setMockAttempts(attempts);
        ResponseEntity<ProgressDtos.SyncResponse> response = restTemplate.exchange(
                "/api/progress/sync", HttpMethod.POST, authed(token, request),
                ProgressDtos.SyncResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    private ProgressDtos.RestoreResponse restore(String token) {
        ResponseEntity<ProgressDtos.RestoreResponse> response = restTemplate.exchange(
                "/api/progress", HttpMethod.GET, authed(token, null),
                ProgressDtos.RestoreResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody();
    }

    private String signUp(String email) {
        RegisterRequest request = new RegisterRequest();
        request.setEmail(email);
        request.setPassword("Radar@12345");
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
