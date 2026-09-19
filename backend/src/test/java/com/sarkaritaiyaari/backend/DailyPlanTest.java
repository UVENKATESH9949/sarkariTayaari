package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.AuthResponse;
import com.sarkaritaiyaari.backend.dto.CreateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.DailyPlanDtos.DailyPlanResponse;
import com.sarkaritaiyaari.backend.dto.DailyPlanDtos.PlannedTask;
import com.sarkaritaiyaari.backend.dto.ExamTopicsRequest;
import com.sarkaritaiyaari.backend.dto.PreparationProfileDtos.PreparationProfile;
import com.sarkaritaiyaari.backend.dto.PreparationProfileDtos.ProfileResponse;
import com.sarkaritaiyaari.backend.dto.PreparationProfileDtos.SyncResponse;
import com.sarkaritaiyaari.backend.dto.QuestionResponse;
import com.sarkaritaiyaari.backend.dto.RegisterRequest;
import com.sarkaritaiyaari.backend.dto.SubjectRequest;
import com.sarkaritaiyaari.backend.dto.SubjectResponse;
import com.sarkaritaiyaari.backend.dto.TopicRequest;
import com.sarkaritaiyaari.backend.dto.TopicResponse;
import com.sarkaritaiyaari.backend.dto.TranslationRequest;
import com.sarkaritaiyaari.backend.entity.TopicPriority;
import com.sarkaritaiyaari.backend.repository.ExamTopicRepository;
import com.sarkaritaiyaari.backend.repository.StudyTaskRepository;
import com.sarkaritaiyaari.backend.repository.TopicPriorityRepository;
import com.sarkaritaiyaari.backend.repository.UserPreparationProfileRepository;
import com.sarkaritaiyaari.backend.repository.UserTopicHealthRepository;
import com.sarkaritaiyaari.backend.repository.UserTopicProgressRepository;
import com.sarkaritaiyaari.backend.service.DailyPlanService;
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
 * The daily plan and the preparation profile it reads (TASK-3301, Phase 5), end to end against the
 * real database.
 *
 * <p>The case that matters most is Gate 3's own wording: a student who said "1–2 hours" gets tasks
 * summing to roughly 90 minutes, each pointing at a topic that has questions behind it. Everything
 * else here protects that: the profile actually reaching the server, the day being planned once
 * rather than re-planned on every read, and the budget falling back honestly when nobody onboarded.
 *
 * <p>The fixtures are deliberately small — three questions per topic. The roadmap's steps ask for a
 * fixed question count whatever the bank holds, so thirty exercises exactly the same paths as three
 * while costing thirty API calls per topic. The first version of this class used thirty and took
 * <b>61 minutes</b>, almost all of it creating questions nothing asserted on.
 */
class DailyPlanTest extends AbstractIntegrationTest {

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
                studyTaskRepository.deleteAll(
                        studyTaskRepository.findAll().stream()
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

    /* ------------------------------------------------------------------ the preparation profile */

    @Test
    void theProfileRoundTripsAndIsScopedToItsOwner() {
        String owner = signUp("plan.profile." + runId + "@example.com");
        String other = signUp("plan.other." + runId + "@example.com");

        SyncResponse stored = putProfile(owner, profile("ONE_TO_TWO", "PRACTICING",
                OffsetDateTime.now().minusMinutes(5)));
        assertThat(stored.stored()).isTrue();
        assertThat(stored.profile().dailyStudyTime()).isEqualTo("ONE_TO_TWO");

        assertThat(getProfile(owner).profile().preparationLevel()).isEqualTo("PRACTICING");
        // Nothing in the route names a user, so another account simply has its own — empty.
        assertThat(getProfile(other).profile()).isNull();
    }

    /**
     * Last-write-wins, resolved on the timestamp the DEVICE recorded rather than on arrival order.
     * An edit made offline and uploaded later happened when it happened.
     */
    @Test
    void anOlderEditDoesNotOverwriteANewerOneAndTheLoserIsToldWhatWon() {
        String token = signUp("plan.conflict." + runId + "@example.com");
        OffsetDateTime recent = OffsetDateTime.now().minusMinutes(1);
        OffsetDateTime stale = OffsetDateTime.now().minusDays(3);

        assertThat(putProfile(token, profile("TWO_TO_FOUR", "REVISING", recent)).stored()).isTrue();

        SyncResponse losing = putProfile(token, profile("UNDER_1H", "JUST_STARTING", stale));

        assertThat(losing.stored()).isFalse();
        // The loser is handed the winner in the same round trip, so it can correct itself.
        assertThat(losing.profile().dailyStudyTime()).isEqualTo("TWO_TO_FOUR");
        assertThat(getProfile(token).profile().dailyStudyTime()).isEqualTo("TWO_TO_FOUR");
    }

    @Test
    void anUnknownStudyTimeBandIsRejected() {
        String token = signUp("plan.badband." + runId + "@example.com");

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/me/preparation-profile", HttpMethod.POST,
                authed(token, profile("SEVEN_HOURS_ISH", "PRACTICING", OffsetDateTime.now())),
                String.class);

        // Rejected at the boundary rather than reaching the planner, which would then have to guess
        // what an unrecognised band means.
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    /* ------------------------------------------------------------------------ Gate 3's own test */

    /**
     * The exit criterion, near enough verbatim: a student who said "1–2 hours" gets a day of work
     * that fits, and every task points at a topic with questions behind it.
     */
    @Test
    void aOneToTwoHourStudentGetsADayThatFitsTheBudget() {
        Fixture fixture = examWithTopics("fits", 4);
        for (UUID topicId : fixture.topicIds) createQuestions(fixture, topicId, 3);
        double priority = 90.0;
        for (UUID topicId : fixture.topicIds) {
            givePriority(fixture.examCode, topicId, String.valueOf(priority));
            priority -= 1.0;
        }

        String token = signUp("plan.fits." + runId + "@example.com");
        putProfile(token, profile("ONE_TO_TWO", "PRACTICING", OffsetDateTime.now()));

        DailyPlanResponse plan = plan(token, fixture.examCode);

        assertThat(plan.budget().dailyStudyTime()).isEqualTo("ONE_TO_TWO");
        assertThat(plan.budget().minutes()).isEqualTo(90);
        assertThat(plan.budget().basis()).isEqualTo("STATED_BAND");

        assertThat(plan.tasks()).isNotEmpty();
        assertThat(plan.plannedMinutes()).isPositive().isLessThanOrEqualTo(90);
        assertThat(plan.generated()).isTrue();

        for (PlannedTask task : plan.tasks()) {
            assertThat(task.plannedMinutes()).isPositive();
            assertThat(task.topicId()).isNotNull();
            assertThat(task.source()).isIn("PRACTICE", "REVISION");
            assertThat(task.status()).isEqualTo("ASSIGNED");
            // Every task must be sized from a declared tier, exactly like the roadmap it came from.
            assertThat(task.estimate())
                    .isIn("PERSONAL_TOPIC", "COHORT_TOPIC", "COHORT_DIFFICULTY", "DEFAULT");
        }
        assertThat(plan.tasks()).extracting(PlannedTask::displayOrder)
                .isSorted();
    }

    /**
     * A day is planned once. Re-planning on every read would show a different list to a student who
     * had already started, and would destroy the record of what was originally assigned — which is
     * the only reason this phase stores anything at all.
     */
    @Test
    void asecondReadReturnsTheSamePlanRatherThanReplanning() {
        Fixture fixture = examWithTopics("stable", 3);
        for (UUID topicId : fixture.topicIds) createQuestions(fixture, topicId, 3);
        givePriority(fixture.examCode, fixture.topicIds.get(0), "80.00");

        String token = signUp("plan.stable." + runId + "@example.com");
        putProfile(token, profile("ONE_TO_TWO", "LEARNING", OffsetDateTime.now()));

        DailyPlanResponse first = plan(token, fixture.examCode);
        DailyPlanResponse second = plan(token, fixture.examCode);

        assertThat(first.generated()).isTrue();
        assertThat(second.generated()).isFalse();
        assertThat(second.tasks()).extracting(PlannedTask::taskId)
                .containsExactlyElementsOf(first.tasks().stream().map(PlannedTask::taskId).toList());
        assertThat(second.plannedMinutes()).isEqualTo(first.plannedMinutes());
    }

    /**
     * An account that never onboarded still gets a plan — it is exactly the account most in need of
     * one — but the budget is labelled DEFAULT rather than dressed up as the student's own answer.
     */
    @Test
    void withNoProfileTheBudgetIsADeclaredDefault() {
        Fixture fixture = examWithTopics("noprofile", 3);
        for (UUID topicId : fixture.topicIds) createQuestions(fixture, topicId, 3);
        givePriority(fixture.examCode, fixture.topicIds.get(0), "70.00");

        String token = signUp("plan.noprofile." + runId + "@example.com");
        DailyPlanResponse plan = plan(token, fixture.examCode);

        assertThat(plan.budget().dailyStudyTime()).isNull();
        assertThat(plan.budget().minutes()).isEqualTo(DailyPlanService.DEFAULT_BUDGET_MINUTES);
        assertThat(plan.budget().basis()).isEqualTo("DEFAULT");
        assertThat(plan.tasks()).isNotEmpty();
    }

    /* ------------------------------------------------------------------------ access and zones */

    @Test
    void requiresASignedInUser() {
        Fixture fixture = examWithTopics("auth", 1);

        ResponseEntity<String> anonymous = restTemplate.getForEntity(
                "/api/me/daily-plan?examCode=" + fixture.examCode, String.class);

        assertThat(anonymous.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    /** An unknown zone is a 400, never a silent fallback that would plan a different day. */
    @Test
    void anUnknownTimeZoneIsRejected() {
        Fixture fixture = examWithTopics("zone", 1);
        createQuestions(fixture, fixture.topicIds.get(0), 3);
        String token = signUp("plan.zone." + runId + "@example.com");

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/me/daily-plan?examCode=" + fixture.examCode + "&zone=Mars/Olympus",
                HttpMethod.GET, authed(token, null), String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void anExamWithNothingPracticableGetsAnEmptyPlanRatherThanAnError() {
        Fixture fixture = examWithTopics("barren", 2);
        // No questions created at all: nothing in this exam can be practised.
        String token = signUp("plan.barren." + runId + "@example.com");

        DailyPlanResponse plan = plan(token, fixture.examCode);

        assertThat(plan.tasks()).isEmpty();
        assertThat(plan.plannedMinutes()).isZero();
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

    private static PreparationProfile profile(String band, String level, OffsetDateTime updatedAt) {
        return new PreparationProfile("Test Student", null, null, 2027, level, band, updatedAt);
    }

    private SyncResponse putProfile(String token, PreparationProfile profile) {
        ResponseEntity<SyncResponse> response = restTemplate.exchange(
                "/api/me/preparation-profile", HttpMethod.POST, authed(token, profile),
                SyncResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody();
    }

    private ProfileResponse getProfile(String token) {
        ResponseEntity<ProfileResponse> response = restTemplate.exchange(
                "/api/me/preparation-profile", HttpMethod.GET, authed(token, null),
                ProfileResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody();
    }

    private Fixture examWithTopics(String suffix, int count) {
        String code = ("PLAN_" + suffix + "_" + runId).toUpperCase();
        Map<String, Object> examPayload = Map.of(
                "code", code, "name", "Plan " + suffix + " " + runId,
                "active", false, "displayOrder", 993);
        ResponseEntity<Map> exam = restTemplate.postForEntity(
                "/api/exams", adminAuth(examPayload), Map.class);
        assertThat(exam.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdExamCodes.add(code);

        SubjectRequest subjectRequest = new SubjectRequest();
        subjectRequest.setName("Plan " + suffix + " Subject " + runId);
        ResponseEntity<SubjectResponse> subject = restTemplate.postForEntity(
                "/api/subjects", adminAuth(subjectRequest), SubjectResponse.class);
        assertThat(subject.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        UUID subjectId = subject.getBody().getId();
        createdSubjectIds.add(subjectId);

        List<UUID> topicIds = new ArrayList<>();
        for (int i = 0; i < count; i++) {
            topicIds.add(createTopic(subjectId, "Plan " + suffix + " Topic " + i));
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

    private void createQuestions(Fixture fixture, UUID topicId, int count) {
        for (int i = 0; i < count; i++) {
            CreateQuestionRequest request = new CreateQuestionRequest();
            request.setCorrectAnswer("A");
            request.setTopicId(topicId);
            request.setDifficulty("medium");
            request.setExamCodes(List.of(fixture.examCode));
            TranslationRequest en = new TranslationRequest();
            en.setLanguageCode("en");
            en.setQuestionText("Plan fixture question " + runId + " #" + i + " for " + topicId);
            en.setOptions(List.of("One", "Two", "Three", "Four"));
            en.setExplanation("Because.");
            request.setTranslations(List.of(en));

            ResponseEntity<QuestionResponse> response = restTemplate.postForEntity(
                    "/api/questions", adminAuth(request), QuestionResponse.class);
            assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
            createdIds.add(response.getBody().getId());
        }
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

    private String signUp(String email) {
        RegisterRequest request = new RegisterRequest();
        request.setEmail(email);
        request.setPassword("Plan@12345");
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
