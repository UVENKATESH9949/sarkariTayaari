package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.AuthResponse;
import com.sarkaritaiyaari.backend.dto.CreateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.ExamTopicsRequest;
import com.sarkaritaiyaari.backend.dto.ProgressDtos;
import com.sarkaritaiyaari.backend.dto.QuestionResponse;
import com.sarkaritaiyaari.backend.dto.RegisterRequest;
import com.sarkaritaiyaari.backend.dto.RevisionPlanDtos.RevisionPlanResponse;
import com.sarkaritaiyaari.backend.dto.RevisionPlanDtos.RevisionTopic;
import com.sarkaritaiyaari.backend.dto.SubjectRequest;
import com.sarkaritaiyaari.backend.dto.SubjectResponse;
import com.sarkaritaiyaari.backend.dto.TopicRequest;
import com.sarkaritaiyaari.backend.dto.TopicResponse;
import com.sarkaritaiyaari.backend.dto.TranslationRequest;
import com.sarkaritaiyaari.backend.entity.TopicPriority;
import com.sarkaritaiyaari.backend.repository.ExamTopicRepository;
import com.sarkaritaiyaari.backend.repository.TopicPriorityRepository;
import com.sarkaritaiyaari.backend.repository.UserTopicHealthRepository;
import com.sarkaritaiyaari.backend.repository.UserTopicProgressRepository;
import com.sarkaritaiyaari.backend.service.RevisionPlanService;
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
 * The revision plan (TASK-3201, Phase 7) end to end against the real database: real attempts
 * uploaded through the real sync endpoint, read back through {@code GET /api/me/revision-plan}.
 *
 * <p>The ladder's decision table is asserted separately, and faster, in
 * {@code service.RevisionLadderTest} with constructed states. What this class covers is the part
 * only a real round trip can show: that a real attempt's timestamp produces a real due date, that
 * an untouched topic is excluded rather than given one, and that the re-test resolves to something
 * the app can actually open.
 *
 * <p>Deliberately, no test here asserts <i>which</i> rung a real attempt produces — that depends on
 * the health model's verdict, which is its own service's business. The tests instead assert
 * properties that hold whatever verdict comes back: an attempt older than the longest interval is
 * due, one from today is not, and the interval is always one of the four rungs.
 */
class RevisionPlanTest extends AbstractIntegrationTest {

    @Autowired private ExamTopicRepository examTopicRepository;
    @Autowired private TopicPriorityRepository topicPriorityRepository;
    @Autowired private UserTopicHealthRepository userTopicHealthRepository;
    @Autowired private UserTopicProgressRepository userTopicProgressRepository;

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
                "/api/me/revision-plan?examCode=" + fixture.examCode, String.class);

        assertThat(anonymous.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void unknownExamIs404() {
        String token = signUp("revision.unknown." + runId + "@example.com");

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/me/revision-plan?examCode=NO_SUCH_" + runId,
                HttpMethod.GET, authed(token, null), String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    /* --------------------------------------------------------------------- nothing to revise */

    /**
     * A topic nobody has practised has nothing to revise. Saying so explicitly is more useful than
     * a due date computed from no evidence — and it keeps the two halves of the program apart: this
     * topic belongs to the roadmap's learning path, not here.
     */
    @Test
    void anUntouchedTopicIsNotScheduledAndSaysWhy() {
        Fixture fixture = examWithTopics("fresh", 1);
        String token = signUp("revision.fresh." + runId + "@example.com");
        createQuestions(fixture, fixture.topicIds.get(0), 3);

        RevisionTopic topic = onlyTopic(plan(token, fixture.examCode), fixture.topicIds.get(0));

        assertThat(topic.status()).isEqualTo("NOT_SCHEDULED");
        assertThat(topic.notScheduledReason()).isEqualTo("NEVER_PRACTISED");
        assertThat(topic.dueAt()).isNull();
        assertThat(topic.intervalDays()).isNull();
        // No re-test either: there is nothing to re-test.
        assertThat(topic.retest()).isNull();
    }

    /** A topic the bank cannot test is not a revision candidate, whatever its state. */
    @Test
    void aTopicWithNoQuestionsIsNotInThePlanAtAll() {
        Fixture fixture = examWithTopics("empty", 2);
        UUID practicable = fixture.topicIds.get(0);
        UUID barren = fixture.topicIds.get(1);
        createQuestions(fixture, practicable, 2);

        String token = signUp("revision.empty." + runId + "@example.com");
        RevisionPlanResponse plan = plan(token, fixture.examCode);

        assertThat(plan.topics()).extracting(RevisionTopic::topicId).contains(practicable);
        assertThat(plan.topics()).extracting(RevisionTopic::topicId).doesNotContain(barren);
    }

    /* ------------------------------------------------------------------------ due, and overdue */

    /**
     * The decisive case. An attempt older than the longest rung is due whichever verdict the health
     * model reaches, so this asserts real scheduling without asserting the health model's business.
     */
    @Test
    void aTopicLastPractisedLongAgoIsDueAndLeadsThePlan() {
        Fixture fixture = examWithTopics("due", 2);
        UUID stale = fixture.topicIds.get(0);
        UUID fresh = fixture.topicIds.get(1);
        List<UUID> staleQuestions = createQuestions(fixture, stale, 6);
        List<UUID> freshQuestions = createQuestions(fixture, fresh, 6);
        givePriority(fixture.examCode, stale, "40.00");
        givePriority(fixture.examCode, fresh, "90.00");

        String token = signUp("revision.due." + runId + "@example.com");
        upload(token, List.of(
                // 90 days ago — beyond even the 45-day rung.
                session("session-stale-" + runId, staleQuestions, 4, 90),
                // Today.
                session("session-fresh-" + runId, freshQuestions, 4, 0)));

        RevisionPlanResponse plan = plan(token, fixture.examCode);
        RevisionTopic staleTopic = onlyTopic(plan, stale);
        RevisionTopic freshTopic = onlyTopic(plan, fresh);

        assertThat(staleTopic.status()).isEqualTo("DUE");
        assertThat(staleTopic.daysOverdue()).isNotNull().isPositive();
        assertThat(staleTopic.daysUntilDue()).isNull();
        assertThat(staleTopic.dueAt()).isNotNull();
        assertThat(staleTopic.intervalDays()).isIn(
                RevisionPlanService.RUNG_1_DAYS, RevisionPlanService.RUNG_2_DAYS,
                RevisionPlanService.RUNG_3_DAYS, RevisionPlanService.RUNG_4_DAYS);
        assertThat(staleTopic.rungReason()).isNotBlank();
        assertThat(staleTopic.daysSinceLastPractice()).isGreaterThanOrEqualTo(89);

        assertThat(freshTopic.status()).isEqualTo("NOT_DUE");
        assertThat(freshTopic.daysUntilDue()).isNotNull();
        assertThat(freshTopic.daysOverdue()).isNull();

        // Ordering: due work leads, even though the fresh topic carries more than twice the exam
        // priority. Urgency of forgetting beats exam weight here, which is the phase's whole point.
        assertThat(plan.topics().get(0).topicId()).isEqualTo(stale);
        assertThat(plan.dueCount()).isEqualTo(1);
        assertThat(plan.totalDueMinutes()).isNotNull().isPositive();
    }

    /** Nothing due is a real answer, and totalDueMinutes says so with null rather than zero. */
    @Test
    void whenNothingIsDueTheTotalIsNullRatherThanZero() {
        Fixture fixture = examWithTopics("none", 1);
        UUID topicId = fixture.topicIds.get(0);
        List<UUID> questionIds = createQuestions(fixture, topicId, 5);

        String token = signUp("revision.none." + runId + "@example.com");
        upload(token, List.of(session("session-none-" + runId, questionIds, 4, 0)));

        RevisionPlanResponse plan = plan(token, fixture.examCode);

        assertThat(plan.dueCount()).isZero();
        assertThat(plan.totalDueMinutes()).isNull();
        assertThat(plan.intervalBasis()).isEqualTo(RevisionPlanService.INTERVAL_BASIS);
    }

    /* ------------------------------------------------------------------------------- re-test */

    /**
     * D7.2: the re-test is timed practice on the topic, and it can never ask for more questions
     * than the bank holds — a re-test that opens a screen it cannot fill is the same failure the
     * roadmap's zero-question rule exists to prevent.
     */
    @Test
    void theRetestIsTimedPracticeAndNeverExceedsTheQuestionsAvailable() {
        Fixture fixture = examWithTopics("retest", 1);
        UUID topicId = fixture.topicIds.get(0);
        // Deliberately fewer questions than any recommended step would ask for.
        List<UUID> questionIds = createQuestions(fixture, topicId, 2);

        String token = signUp("revision.retest." + runId + "@example.com");
        /*
         * Three sessions over the same two questions, not one. The health model needs a real
         * evidence window before it will assert a verdict at all, and a two-question topic cannot
         * reach that in a single sitting — the first version of this test used one session, got
         * INSUFFICIENT_DATA, and therefore NOT_SCHEDULED with no re-test. That was the service
         * behaving exactly as designed; the fixture was what was wrong.
         */
        upload(token, List.of(
                session("session-retest-a-" + runId, questionIds, 1, 62),
                session("session-retest-b-" + runId, questionIds, 2, 61),
                session("session-retest-c-" + runId, questionIds, 1, 60)));

        RevisionTopic topic = onlyTopic(plan(token, fixture.examCode), topicId);

        assertThat(topic.retest()).isNotNull();
        assertThat(topic.retest().action()).isEqualTo("TIMED_PRACTICE");
        assertThat(topic.retest().questionCount()).isPositive().isLessThanOrEqualTo(2);
        assertThat(topic.retest().questionCountBasis()).isIn("RECOMMENDED_STEP", "DEFAULT");
        assertThat(topic.retest().estimatedMinutes()).isPositive();
        // Minutes come from the shared estimator, so they declare their tier exactly as the
        // roadmap's do — the two endpoints cannot disagree about how long a question takes.
        assertThat(topic.retest().estimate().source())
                .isIn("PERSONAL_TOPIC", "COHORT_TOPIC", "COHORT_DIFFICULTY", "DEFAULT");
    }

    /* ------------------------------------------------------------------------------ scoping */

    @Test
    void oneStudentsScheduleIsNotAnothers() {
        Fixture fixture = examWithTopics("scope", 1);
        UUID topicId = fixture.topicIds.get(0);
        List<UUID> questionIds = createQuestions(fixture, topicId, 5);

        String owner = signUp("revision.owner." + runId + "@example.com");
        String other = signUp("revision.other." + runId + "@example.com");
        upload(owner, List.of(session("session-scope-" + runId, questionIds, 3, 90)));

        assertThat(onlyTopic(plan(owner, fixture.examCode), topicId).status()).isEqualTo("DUE");

        RevisionTopic theirs = onlyTopic(plan(other, fixture.examCode), topicId);
        assertThat(theirs.status()).isEqualTo("NOT_SCHEDULED");
        assertThat(theirs.notScheduledReason()).isEqualTo("NEVER_PRACTISED");
    }

    /* ------------------------------------------------------------------------------ helpers */

    private record Fixture(String examCode, UUID subjectId, List<UUID> topicIds) {
    }

    private RevisionPlanResponse plan(String token, String examCode) {
        ResponseEntity<RevisionPlanResponse> response = restTemplate.exchange(
                "/api/me/revision-plan?examCode=" + examCode,
                HttpMethod.GET, authed(token, null), RevisionPlanResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody();
    }

    private static RevisionTopic onlyTopic(RevisionPlanResponse response, UUID topicId) {
        return response.topics().stream()
                .filter(t -> t.topicId().equals(topicId))
                .findFirst()
                .orElseThrow(() -> new AssertionError("topic " + topicId + " missing from plan"));
    }

    private Fixture examWithTopics(String suffix, int count) {
        String code = ("REVISION_" + suffix + "_" + runId).toUpperCase();
        Map<String, Object> examPayload = Map.of(
                "code", code, "name", "Revision " + suffix + " " + runId,
                "active", false, "displayOrder", 994);
        ResponseEntity<Map> exam = restTemplate.postForEntity(
                "/api/exams", adminAuth(examPayload), Map.class);
        assertThat(exam.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdExamCodes.add(code);

        SubjectRequest subjectRequest = new SubjectRequest();
        subjectRequest.setName("Revision " + suffix + " Subject " + runId);
        ResponseEntity<SubjectResponse> subject = restTemplate.postForEntity(
                "/api/subjects", adminAuth(subjectRequest), SubjectResponse.class);
        assertThat(subject.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        UUID subjectId = subject.getBody().getId();
        createdSubjectIds.add(subjectId);

        List<UUID> topicIds = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            topicIds.add(createTopic(subjectId, "Revision " + suffix + " Topic " + i));
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
            en.setQuestionText("Revision fixture question " + runId + " #" + i + " for " + topicId);
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

    private void givePriority(String examCode, UUID topicId, String priority) {
        TopicPriority row = new TopicPriority();
        row.setId(TopicPriority.idFor(examCode, topicId, TopicIntelligenceService.ALGORITHM_VERSION));
        row.setExam(examRepository.findById(examCode).orElseThrow());
        row.setTopic(topicRepository.findById(topicId).orElseThrow());
        row.setAlgorithmVersion(TopicIntelligenceService.ALGORITHM_VERSION);
        row.setSystemPriority(new BigDecimal(priority));
        row.setFinalPriority(new BigDecimal(priority));
        row.setComputedAt(OffsetDateTime.now());
        topicPriorityRepository.save(row);
    }

    private ProgressDtos.PracticeSession session(String id, List<UUID> questionIds,
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
            r.setTimeMs(60_000);
            results.add(r);
        }
        session.setResults(results);
        return session;
    }

    private void upload(String token, List<ProgressDtos.PracticeSession> sessions) {
        ProgressDtos.SyncRequest request = new ProgressDtos.SyncRequest();
        request.setPracticeSessions(sessions);
        ResponseEntity<ProgressDtos.SyncResponse> response = restTemplate.exchange(
                "/api/progress/sync", HttpMethod.POST, authed(token, request),
                ProgressDtos.SyncResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    private String signUp(String email) {
        RegisterRequest request = new RegisterRequest();
        request.setEmail(email);
        request.setPassword("Revision@12345");
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
