package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.AuthResponse;
import com.sarkaritaiyaari.backend.dto.CreateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.DailyPlanDtos.DailyPlanResponse;
import com.sarkaritaiyaari.backend.dto.DailyPlanDtos.PlannedTask;
import com.sarkaritaiyaari.backend.dto.ExamTopicsRequest;
import com.sarkaritaiyaari.backend.dto.ProgressDtos;
import com.sarkaritaiyaari.backend.dto.QuestionResponse;
import com.sarkaritaiyaari.backend.dto.RegisterRequest;
import com.sarkaritaiyaari.backend.dto.SubjectRequest;
import com.sarkaritaiyaari.backend.dto.SubjectResponse;
import com.sarkaritaiyaari.backend.dto.TopicRequest;
import com.sarkaritaiyaari.backend.dto.TopicResponse;
import com.sarkaritaiyaari.backend.dto.TranslationRequest;
import com.sarkaritaiyaari.backend.entity.StudyTask;
import com.sarkaritaiyaari.backend.entity.TopicPriority;
import com.sarkaritaiyaari.backend.repository.ExamTopicRepository;
import com.sarkaritaiyaari.backend.repository.StudyTaskRepository;
import com.sarkaritaiyaari.backend.repository.TopicPriorityRepository;
import com.sarkaritaiyaari.backend.repository.UserPreparationProfileRepository;
import com.sarkaritaiyaari.backend.repository.UserTopicHealthRepository;
import com.sarkaritaiyaari.backend.repository.UserTopicProgressRepository;
import com.sarkaritaiyaari.backend.service.TaskOutcomeService;
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
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Adaptive re-planning (TASK-3401, Phase 6) end to end against the real database.
 *
 * <p>Phase 6 does not build an adaptation engine — Phases 3-5 already close that loop, since
 * practising changes the health model which changes the roadmap which changes tomorrow's plan. What
 * this phase adds, and what this class covers, is making that legible and recorded: yesterday's
 * tasks stop saying ASSIGNED, every task says why it is there, and what actually happened against a
 * plan is readable.
 *
 * <p>The outcome rule itself is asserted separately and far faster in
 * {@code service.TaskOutcomeRuleTest}, with constructed counts. This class covers the parts only a
 * real round trip can show.
 */
class AdaptiveReplanningTest extends AbstractIntegrationTest {

    private static final ZoneId ZONE = ZoneId.of("Asia/Kolkata");

    @Autowired private ExamTopicRepository examTopicRepository;
    @Autowired private TopicPriorityRepository topicPriorityRepository;
    @Autowired private UserTopicHealthRepository userTopicHealthRepository;
    @Autowired private UserTopicProgressRepository userTopicProgressRepository;
    @Autowired private UserPreparationProfileRepository profileRepository;
    @Autowired private StudyTaskRepository studyTaskRepository;

    private final String runId = UUID.randomUUID().toString().substring(0, 8);
    private final List<String> createdEmails = new ArrayList<>();

    @AfterEach
    void clearReferences() {
        for (String email : createdEmails) {
            userRepository.findByEmail(email).ifPresent(u -> {
                studyTaskRepository.deleteAll(studyTaskRepository.findAll().stream()
                        .filter(t -> u.getId().equals(t.getUserId()))
                        .toList());
                profileRepository.findByUserId(u.getId()).ifPresent(profileRepository::delete);
            });
        }
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

    /* ------------------------------------------------------------------------- the explanation */

    /**
     * D6.3: every task says why it is there. A plan that changes with no reason given reads as
     * arbitrary, and this is what makes Gate 4's "explain the change in one deterministic sentence"
     * true of every row rather than of the plan as a whole.
     */
    @Test
    void everyTaskCarriesADeterministicReason() {
        Fixture fixture = examWithTopics("reason", 3);
        for (UUID topicId : fixture.topicIds) createQuestions(fixture, topicId, 3);
        double priority = 80.0;
        for (UUID topicId : fixture.topicIds) {
            givePriority(fixture.examCode, topicId, String.valueOf(priority));
            priority -= 1.0;
        }

        String token = signUp("adapt.reason." + runId + "@example.com");
        DailyPlanResponse plan = plan(token, fixture.examCode);

        assertThat(plan.tasks()).isNotEmpty();
        for (PlannedTask task : plan.tasks()) {
            assertThat(task.reason())
                    .as("task for %s must explain itself", task.topicName())
                    .isNotBlank();
            // The sentence names the topic it is about, so it stands alone in a list.
            assertThat(task.reason()).contains(task.topicName());
        }

        // A never-started topic says so, rather than giving a generic ranking line. This is the
        // branch a brand-new student sees, so it is the one worth pinning.
        assertThat(plan.tasks().get(0).reason()).containsIgnoringCase("not started");
    }

    /* --------------------------------------------------------------------------- settlement */

    /**
     * The core of the phase. A task assigned yesterday that the student never touched settles to
     * SKIPPED; one they genuinely practised settles to COMPLETED. Until this existed, every task
     * said ASSIGNED forever and the four-way distinction study_tasks was built for was recordable
     * but never recorded.
     */
    @Test
    void yesterdaysTasksSettleFromWhatWasActuallyPractised() {
        Fixture fixture = examWithTopics("settle", 2);
        UUID done = fixture.topicIds.get(0);
        UUID ignored = fixture.topicIds.get(1);
        List<UUID> doneQuestions = createQuestions(fixture, done, 6);
        createQuestions(fixture, ignored, 3);
        givePriority(fixture.examCode, done, "80.00");
        givePriority(fixture.examCode, ignored, "70.00");

        String token = signUp("adapt.settle." + runId + "@example.com");
        UUID userId = userRepository.findByEmail("adapt.settle." + runId + "@example.com")
                .orElseThrow().getId();

        LocalDate yesterday = LocalDate.now(ZONE).minusDays(1);
        UUID doneTaskId = seedTask(userId, fixture.examCode, yesterday, done, "Done topic", 5);
        UUID ignoredTaskId = seedTask(userId, fixture.examCode, yesterday, ignored, "Ignored topic", 5);

        // Real practice on one topic only, dated inside yesterday in the student's own zone.
        upload(token, List.of(sessionAt("session-settle-" + runId, doneQuestions, 4,
                yesterday.atTime(19, 30).atZone(ZONE).toOffsetDateTime())));

        // Reading today's plan is what settles the closed day.
        DailyPlanResponse plan = plan(token, fixture.examCode);
        assertThat(plan.settledTaskCount()).isGreaterThanOrEqualTo(2);

        StudyTask settledDone = studyTaskRepository.findById(doneTaskId).orElseThrow();
        StudyTask settledIgnored = studyTaskRepository.findById(ignoredTaskId).orElseThrow();

        // 6 answered against 5 planned — comfortably over the threshold.
        assertThat(settledDone.getStatus()).isEqualTo(TaskOutcomeService.COMPLETED);
        assertThat(settledIgnored.getStatus()).isEqualTo(TaskOutcomeService.SKIPPED);
    }

    /** Settlement runs once. A second read must not re-judge a day that is already decided. */
    @Test
    void settlementIsIdempotent() {
        Fixture fixture = examWithTopics("once", 1);
        UUID topicId = fixture.topicIds.get(0);
        createQuestions(fixture, topicId, 3);
        givePriority(fixture.examCode, topicId, "60.00");

        String token = signUp("adapt.once." + runId + "@example.com");
        UUID userId = userRepository.findByEmail("adapt.once." + runId + "@example.com")
                .orElseThrow().getId();
        seedTask(userId, fixture.examCode, LocalDate.now(ZONE).minusDays(1), topicId, "Old topic", 5);

        assertThat(plan(token, fixture.examCode).settledTaskCount()).isEqualTo(1);
        // Nothing left unsettled, so the second call judges nothing.
        assertThat(plan(token, fixture.examCode).settledTaskCount()).isZero();
    }

    /**
     * A day still open is not judged. Marking today's untouched tasks SKIPPED at 9am would be both
     * wrong and discouraging.
     */
    @Test
    void todaysOwnTasksAreLeftAssigned() {
        Fixture fixture = examWithTopics("today", 2);
        for (UUID topicId : fixture.topicIds) createQuestions(fixture, topicId, 3);
        givePriority(fixture.examCode, fixture.topicIds.get(0), "60.00");

        String token = signUp("adapt.today." + runId + "@example.com");
        DailyPlanResponse plan = plan(token, fixture.examCode);

        assertThat(plan.tasks()).isNotEmpty();
        assertThat(plan.tasks()).allMatch(t -> "ASSIGNED".equals(t.status()));
    }

    /* ------------------------------------------------------------------- observed activity */

    /**
     * What actually happened, readable against the plan. This is what makes "a bad session changed
     * tomorrow" inspectable rather than something a reader has to take on trust.
     */
    @Test
    void aTaskReportsTheWorkActuallyDoneOnItsTopicToday() {
        Fixture fixture = examWithTopics("observed", 1);
        UUID topicId = fixture.topicIds.get(0);
        List<UUID> questionIds = createQuestions(fixture, topicId, 4);
        givePriority(fixture.examCode, topicId, "75.00");

        String token = signUp("adapt.observed." + runId + "@example.com");
        // Generate today's plan first, then do the work, then read it back.
        plan(token, fixture.examCode);
        upload(token, List.of(sessionAt("session-observed-" + runId, questionIds, 1,
                OffsetDateTime.now())));

        PlannedTask task = plan(token, fixture.examCode).tasks().stream()
                .filter(t -> topicId.equals(t.topicId()))
                .findFirst()
                .orElseThrow(() -> new AssertionError("the assigned topic is missing from the plan"));

        assertThat(task.answeredToday()).isEqualTo(4);
        // 1 of 4 correct. Accuracy is reported but does not decide the outcome — doing the work and
        // doing it well are different questions, and the health model owns the second.
        assertThat(task.accuracyToday()).isEqualTo(25);
        assertThat(task.status()).isEqualTo("ASSIGNED");
    }

    /* ------------------------------------------------------------------------------ helpers */

    private record Fixture(String examCode, UUID subjectId, List<UUID> topicIds) {
    }

    private DailyPlanResponse plan(String token, String examCode) {
        ResponseEntity<DailyPlanResponse> response = restTemplate.exchange(
                "/api/me/daily-plan?examCode=" + examCode + "&zone=Asia/Kolkata",
                HttpMethod.GET, authed(token, null), DailyPlanResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody();
    }

    /** A task assigned on a past day, written directly — the planner only ever assigns for today. */
    private UUID seedTask(UUID userId, String examCode, LocalDate planDate, UUID topicId,
                          String topicName, int plannedQuestionCount) {
        StudyTask task = new StudyTask();
        task.setId(UUID.randomUUID());
        task.setUserId(userId);
        task.setPlanDate(planDate);
        task.setPlanZone(ZONE.getId());
        task.setExamCode(examCode);
        task.setSource("PRACTICE");
        task.setAction("PRACTICE_FOUNDATIONAL");
        topicRepository.findById(topicId).ifPresent(task::setTopic);
        task.setTopicName(topicName);
        task.setPlannedMinutes(15);
        task.setPlannedQuestionCount(plannedQuestionCount);
        task.setEstimateSource("DEFAULT");
        task.setDisplayOrder(0);
        task.setStatus("ASSIGNED");
        task.setReason("Seeded for a past day by AdaptiveReplanningTest.");
        task.setCreatedAt(OffsetDateTime.now().minusDays(1));
        return studyTaskRepository.save(task).getId();
    }

    private Fixture examWithTopics(String suffix, int count) {
        String code = ("ADAPT_" + suffix + "_" + runId).toUpperCase();
        Map<String, Object> examPayload = Map.of(
                "code", code, "name", "Adapt " + suffix + " " + runId,
                "active", false, "displayOrder", 992);
        ResponseEntity<Map> exam = restTemplate.postForEntity(
                "/api/exams", adminAuth(examPayload), Map.class);
        assertThat(exam.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdExamCodes.add(code);

        SubjectRequest subjectRequest = new SubjectRequest();
        subjectRequest.setName("Adapt " + suffix + " Subject " + runId);
        ResponseEntity<SubjectResponse> subject = restTemplate.postForEntity(
                "/api/subjects", adminAuth(subjectRequest), SubjectResponse.class);
        assertThat(subject.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        UUID subjectId = subject.getBody().getId();
        createdSubjectIds.add(subjectId);

        List<UUID> topicIds = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            TopicRequest request = new TopicRequest();
            request.setSubjectId(subjectId);
            request.setName("Adapt " + suffix + " Topic " + i + " " + runId);
            request.setDisplayOrder(1);
            ResponseEntity<TopicResponse> response = restTemplate.postForEntity(
                    "/api/topics", adminAuth(request), TopicResponse.class);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
            UUID id = response.getBody().getId();
            createdTopicIds.add(id);
            topicIds.add(id);
        }
        mapTopics(code, topicIds);
        return new Fixture(code, subjectId, topicIds);
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
            en.setQuestionText("Adapt fixture question " + runId + " #" + i + " for " + topicId);
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

    /** A practice session completed at a specific instant, so it lands in the intended day. */
    private ProgressDtos.PracticeSession sessionAt(String id, List<UUID> questionIds, int correct,
                                                   OffsetDateTime completedAt) {
        ProgressDtos.PracticeSession session = new ProgressDtos.PracticeSession();
        session.setId(id);
        session.setCompletedAt(completedAt);
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
        request.setPassword("Adapt@12345");
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
