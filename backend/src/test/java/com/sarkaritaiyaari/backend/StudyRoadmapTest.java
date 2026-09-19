package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.AuthResponse;
import com.sarkaritaiyaari.backend.dto.CreateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.ExamTopicsRequest;
import com.sarkaritaiyaari.backend.dto.ProgressDtos;
import com.sarkaritaiyaari.backend.dto.QuestionResponse;
import com.sarkaritaiyaari.backend.dto.RegisterRequest;
import com.sarkaritaiyaari.backend.dto.StudyRoadmapDtos.RoadmapStep;
import com.sarkaritaiyaari.backend.dto.StudyRoadmapDtos.RoadmapTopic;
import com.sarkaritaiyaari.backend.dto.StudyRoadmapDtos.StudyRoadmapResponse;
import com.sarkaritaiyaari.backend.dto.SubjectRequest;
import com.sarkaritaiyaari.backend.dto.SubjectResponse;
import com.sarkaritaiyaari.backend.dto.TopicRequest;
import com.sarkaritaiyaari.backend.dto.TopicResponse;
import com.sarkaritaiyaari.backend.dto.TranslationRequest;
import com.sarkaritaiyaari.backend.entity.ContentStatus;
import com.sarkaritaiyaari.backend.entity.RecruitmentCycle;
import com.sarkaritaiyaari.backend.entity.TopicPriority;
import com.sarkaritaiyaari.backend.repository.ExamTopicRepository;
import com.sarkaritaiyaari.backend.repository.RecruitmentCycleRepository;
import com.sarkaritaiyaari.backend.repository.TopicPriorityRepository;
import com.sarkaritaiyaari.backend.repository.UserTopicHealthRepository;
import com.sarkaritaiyaari.backend.repository.UserTopicProgressRepository;
import com.sarkaritaiyaari.backend.service.StudyRoadmapService;
import com.sarkaritaiyaari.backend.service.WorkloadEstimator;
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
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * The personalized roadmap (TASK-3101, Phase 4) end to end, against the real database: real topics
 * mapped to a real exam, real priorities, real attempts uploaded through the real sync endpoint,
 * read back through {@code GET /api/me/study-roadmap}.
 *
 * <p>What this class is for is the three things Phase 4 actually adds, since everything else it
 * reports is forwarded from producers that already have their own tests
 * ({@code TopicHealthScoringTest} owns the arithmetic, {@code WeaknessRadarTest} owns the evidence
 * plumbing and the action steps, {@code LearningStateTest} owns the composite):
 *
 * <ol>
 *   <li><b>minutes, and where each estimate came from</b> — the tier is asserted, not just the
 *       number, because a measured average and a stated constant are different claims;</li>
 *   <li><b>subject balance</b> — the interleave genuinely breaks a run, and the pre-balance rank
 *       survives in the payload so the reordering is visible rather than hidden;</li>
 *   <li><b>the exam's clock</b> — dated when a published cycle has a date, explicitly undated
 *       when it does not, which is the normal case for ten of eleven exams.</li>
 * </ol>
 */
class StudyRoadmapTest extends AbstractIntegrationTest {

    @Autowired private ExamTopicRepository examTopicRepository;
    @Autowired private TopicPriorityRepository topicPriorityRepository;
    @Autowired private UserTopicHealthRepository userTopicHealthRepository;
    @Autowired private UserTopicProgressRepository userTopicProgressRepository;
    @Autowired private RecruitmentCycleRepository recruitmentCycleRepository;

    /** Unique per run, so a leftover row from a failed run cannot make a later run pass or fail. */
    private final String runId = UUID.randomUUID().toString().substring(0, 8);

    private final List<String> createdEmails = new ArrayList<>();
    private final List<UUID> createdCycleIds = new ArrayList<>();

    @AfterEach
    void clearReferences() {
        createdCycleIds.forEach(recruitmentCycleRepository::deleteById);
        createdCycleIds.clear();
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
        Fixture fixture = examWithSubject("auth", 1, 1);

        ResponseEntity<String> anonymous = restTemplate.getForEntity(
                "/api/me/study-roadmap?examCode=" + fixture.examCode, String.class);

        assertThat(anonymous.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    void unknownExamIs404() {
        String token = signUp("roadmap.unknown." + runId + "@example.com");

        ResponseEntity<String> response = restTemplate.exchange(
                "/api/me/study-roadmap?examCode=NO_SUCH_" + runId,
                HttpMethod.GET, authed(token, null), String.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    /* --------------------------------------------------------------- never plan the impossible */

    /**
     * The rule inherited from {@code PreparePlanService}, and the one found on a device rather
     * than by review: a topic can rank first by curated priority while the bank has nothing tagged
     * for it on this exam. A plan that opens an empty question screen is worse than a shorter plan.
     */
    @Test
    void aTopicWithNoPracticableQuestionsIsNeverPlanned() {
        Fixture fixture = examWithSubject("empty", 1, 2);
        UUID practicable = fixture.topicIds.get(0);
        UUID barren = fixture.topicIds.get(1);

        createQuestions(fixture, practicable, 3);
        // barren deliberately gets none, and the higher priority, so it would lead the plan.
        givePriority(fixture.examCode, barren, "99.00");
        givePriority(fixture.examCode, practicable, "10.00");

        String token = signUp("roadmap.empty." + runId + "@example.com");
        StudyRoadmapResponse roadmap = roadmap(token, fixture.examCode);

        assertThat(roadmap.topics()).extracting(RoadmapTopic::topicId).contains(practicable);
        assertThat(roadmap.topics()).extracting(RoadmapTopic::topicId).doesNotContain(barren);
    }

    /* ------------------------------------------------------------------------------ ordering */

    @Test
    void theHigherPriorityTopicLeadsThePlanAndExactlyOneIsRecommended() {
        Fixture fixture = examWithSubject("order", 1, 3);
        for (UUID topicId : fixture.topicIds) createQuestions(fixture, topicId, 2);

        givePriority(fixture.examCode, fixture.topicIds.get(0), "20.00");
        givePriority(fixture.examCode, fixture.topicIds.get(1), "95.00");
        givePriority(fixture.examCode, fixture.topicIds.get(2), "55.00");

        String token = signUp("roadmap.order." + runId + "@example.com");
        StudyRoadmapResponse roadmap = roadmap(token, fixture.examCode);

        assertThat(roadmap.topics()).hasSize(3);
        assertThat(roadmap.topics().get(0).topicId()).isEqualTo(fixture.topicIds.get(1));
        assertThat(roadmap.topics().get(0).priorityRank()).isEqualTo(1);

        // "Next up" is a single item, matching the vocabulary the existing prepare-plan endpoint
        // already established rather than inventing a second one.
        assertThat(roadmap.topics().stream().filter(RoadmapTopic::recommended).count()).isEqualTo(1);
        assertThat(roadmap.topics().get(0).recommended()).isTrue();
    }

    /**
     * Subject balance. The five highest priorities all belong to one subject, so pure priority
     * order would open the plan with five consecutive topics from it — a real way to make a
     * technically-correct plan useless.
     *
     * <p>The pre-balance rank is asserted too: a moved topic must still show where priority alone
     * would have put it, so the reordering is inspectable rather than silent.
     */
    @Test
    void noSubjectRunsLongerThanTheCapAndTheOriginalRankIsStillVisible() {
        Fixture fixture = examWithSubject("balance", 2, 5);
        for (UUID topicId : fixture.topicIds) createQuestions(fixture, topicId, 2);

        // Subject A's five topics take the top five priorities; subject B's two are below them.
        double priority = 99.0;
        for (UUID topicId : fixture.topicIds) {
            givePriority(fixture.examCode, topicId, String.valueOf(priority));
            priority -= 1.0;
        }
        for (UUID topicId : fixture.secondSubjectTopicIds) {
            createQuestions(fixture, topicId, 2);
            givePriority(fixture.examCode, topicId, String.valueOf(priority));
            priority -= 1.0;
        }

        String token = signUp("roadmap.balance." + runId + "@example.com");
        List<RoadmapTopic> topics = roadmap(token, fixture.examCode).topics();

        // Five topics per subject, both subjects mapped: ten in the plan.
        assertThat(topics).hasSize(10);

        /*
         * The cap holds wherever the interleave has a choice. Once one subject's topics are
         * exhausted, the remainder necessarily run consecutively — reordering cannot invent
         * variety the syllabus no longer has — so a run past the cap is only legitimate when
         * every topic from that point on belongs to one subject. Asserting a flat "never more
         * than two" failed on exactly that tail, and the service was right.
         */
        int run = 1;
        for (int i = 1; i < topics.size(); i++) {
            run = topics.get(i).subjectId().equals(topics.get(i - 1).subjectId()) ? run + 1 : 1;
            if (run > StudyRoadmapService.MAX_CONSECUTIVE_PER_SUBJECT) {
                UUID subject = topics.get(i).subjectId();
                assertThat(topics.subList(i, topics.size()))
                        .as("a run past the cap at position %s is only allowed once nothing else "
                                + "is left to interleave with", i)
                        .allMatch(t -> t.subjectId().equals(subject));
            }
        }

        // And the cap genuinely bites where there IS a choice: the plan does not open with the
        // five consecutive same-subject topics that pure priority order would have produced.
        assertThat(topics.get(0).subjectId()).isEqualTo(topics.get(1).subjectId());
        assertThat(topics.get(2).subjectId()).isNotEqualTo(topics.get(1).subjectId());

        // Every rank 1..10 is present exactly once: balancing reorders, never drops or renumbers.
        assertThat(topics).extracting(RoadmapTopic::priorityRank)
                .containsExactlyInAnyOrder(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);

        // And at least one topic genuinely moved — otherwise this test would pass on a plan the
        // interleave never touched, which would prove nothing.
        assertThat(topics.get(2).priorityRank())
                .as("the third slot should have been taken by a topic priority alone ranked lower")
                .isNotEqualTo(3);
    }

    /* ----------------------------------------------------------------------------- workload */

    /**
     * Tier 1 of the estimate ladder. Enough of the student's own timed attempts exist, so the
     * estimate is theirs — 90 seconds a question here — and says so.
     */
    @Test
    void aStudentsOwnMeasuredTimeIsUsedWhenThereIsEnoughOfIt() {
        Fixture fixture = examWithSubject("measured", 1, 1);
        UUID topicId = fixture.topicIds.get(0);
        List<UUID> questionIds = createQuestions(fixture, topicId, 6);
        givePriority(fixture.examCode, topicId, "50.00");

        String token = signUp("roadmap.measured." + runId + "@example.com");
        upload(token, List.of(timedSession("session-measured-" + runId, questionIds, 3, 90_000)));

        RoadmapTopic topic = onlyTopic(roadmap(token, fixture.examCode), topicId);

        assertThat(topic.estimate().source()).isEqualTo("PERSONAL_TOPIC");
        assertThat(topic.estimate().secondsPerQuestion()).isEqualTo(90);
        assertThat(topic.estimate().sampleSize()).isEqualTo(6);
    }

    /**
     * End to end, the tier itself cannot be pinned down — the shared dev database genuinely holds
     * cohort timings, so a "fresh" topic legitimately resolves to COHORT_DIFFICULTY rather than
     * DEFAULT. That is the ladder working, and the first version of this test asserted DEFAULT and
     * failed because of it.
     *
     * <p>So what is asserted here is the property that must hold whatever the database contains:
     * the source is one of the four declared tiers, and the sample size is consistent with it —
     * zero exactly for DEFAULT, at or above the tier's own floor otherwise. The tier-selection
     * rules themselves are asserted with constructed samples in
     * {@code service.WorkloadEstimatorTest}, where the evidence is controlled by the test.
     */
    @Test
    void everyEstimateDeclaresATierWithASampleSizeConsistentWithIt() {
        Fixture fixture = examWithSubject("default", 1, 1);
        UUID topicId = fixture.topicIds.get(0);
        createQuestions(fixture, topicId, 4);
        givePriority(fixture.examCode, topicId, "50.00");

        String token = signUp("roadmap.default." + runId + "@example.com");
        RoadmapTopic topic = onlyTopic(roadmap(token, fixture.examCode), topicId);

        assertThat(topic.estimate().source())
                .isIn("PERSONAL_TOPIC", "COHORT_TOPIC", "COHORT_DIFFICULTY", "DEFAULT");
        assertThat(topic.estimate().secondsPerQuestion()).isPositive();

        if ("DEFAULT".equals(topic.estimate().source())) {
            assertThat(topic.estimate().secondsPerQuestion())
                    .isEqualTo(WorkloadEstimator.DEFAULT_SECONDS_PER_QUESTION);
            assertThat(topic.estimate().sampleSize()).isZero();
        } else {
            long floor = "PERSONAL_TOPIC".equals(topic.estimate().source())
                    ? WorkloadEstimator.MIN_PERSONAL_SAMPLE
                    : WorkloadEstimator.MIN_COHORT_SAMPLE;
            assertThat(topic.estimate().sampleSize()).isGreaterThanOrEqualTo(floor);
        }

        // Whichever tier won, the student still gets real minutes — which is the point of having
        // a ladder at all.
        assertThat(topic.estimatedMinutes()).isNotNull().isPositive();
    }

    /**
     * A step with no question count carries no minutes and contributes nothing to the total.
     * There is no concept-learning content in this product to spend time on, so a duration there
     * would be invented — and an invented number that is summed into a total corrupts the total.
     */
    @Test
    void stepsWithNoQuestionCountCarryNoMinutesAndAreExcludedFromTheTotal() {
        Fixture fixture = examWithSubject("steps", 1, 1);
        UUID topicId = fixture.topicIds.get(0);
        createQuestions(fixture, topicId, 5);
        givePriority(fixture.examCode, topicId, "50.00");

        String token = signUp("roadmap.steps." + runId + "@example.com");
        RoadmapTopic topic = onlyTopic(roadmap(token, fixture.examCode), topicId);

        assertThat(topic.steps()).isNotEmpty();
        for (RoadmapStep step : topic.steps()) {
            if (step.questionCount() == null) {
                assertThat(step.estimatedMinutes())
                        .as("a step that is not a question set has no estimable duration")
                        .isNull();
            } else {
                assertThat(step.estimatedMinutes()).isNotNull().isPositive();
            }
        }

        int summed = topic.steps().stream()
                .map(RoadmapStep::estimatedMinutes)
                .filter(m -> m != null)
                .mapToInt(Integer::intValue)
                .sum();
        assertThat(topic.estimatedMinutes()).isEqualTo(summed);
    }

    /* ----------------------------------------------------------------------------- timeline */

    /**
     * The normal case for ten of this project's eleven exams: no published cycle, so no date. The
     * plan degrades to an ordered backlog and says so, rather than inventing a deadline.
     */
    @Test
    void anExamWithNoPublishedCycleIsAnUndatedBacklog() {
        Fixture fixture = examWithSubject("undated", 1, 1);
        createQuestions(fixture, fixture.topicIds.get(0), 3);
        givePriority(fixture.examCode, fixture.topicIds.get(0), "50.00");

        String token = signUp("roadmap.undated." + runId + "@example.com");
        StudyRoadmapResponse roadmap = roadmap(token, fixture.examCode);

        assertThat(roadmap.timeline().hasExamDate()).isFalse();
        assertThat(roadmap.timeline().examDate()).isNull();
        assertThat(roadmap.timeline().daysRemaining()).isNull();
        assertThat(roadmap.timeline().dailyMinutesRequired()).isNull();
        assertThat(roadmap.timeline().note()).isNotBlank();
        // The plan itself is unaffected — an undated roadmap is still a roadmap.
        assertThat(roadmap.topics()).isNotEmpty();
        assertThat(roadmap.totalEstimatedMinutes()).isNotNull().isPositive();
    }

    @Test
    void aPublishedCycleWithAnExamDateGivesDaysRemainingAndADailyFigure() {
        Fixture fixture = examWithSubject("dated", 1, 1);
        createQuestions(fixture, fixture.topicIds.get(0), 3);
        givePriority(fixture.examCode, fixture.topicIds.get(0), "50.00");
        publishCycleWithExamStart(fixture.examCode, LocalDate.now().plusDays(40));

        String token = signUp("roadmap.dated." + runId + "@example.com");
        StudyRoadmapResponse roadmap = roadmap(token, fixture.examCode);

        assertThat(roadmap.timeline().hasExamDate()).isTrue();
        assertThat(roadmap.timeline().daysRemaining()).isEqualTo(40);

        // Plain arithmetic over the estimate, rounded up — asserted against the figure the same
        // response reports, so the two can never drift apart unnoticed.
        int expected = (int) Math.max(1, Math.ceil(roadmap.totalEstimatedMinutes() / 40.0));
        assertThat(roadmap.timeline().dailyMinutesRequired()).isEqualTo(expected);
    }

    /**
     * A date that has passed is not a countdown. The plan stays usable and the date is still
     * reported, but nothing negative is presented as a schedule.
     */
    @Test
    void anExamDateInThePastIsReportedWithoutACountdown() {
        Fixture fixture = examWithSubject("past", 1, 1);
        createQuestions(fixture, fixture.topicIds.get(0), 3);
        givePriority(fixture.examCode, fixture.topicIds.get(0), "50.00");
        publishCycleWithExamStart(fixture.examCode, LocalDate.now().minusDays(5));

        String token = signUp("roadmap.past." + runId + "@example.com");
        StudyRoadmapResponse roadmap = roadmap(token, fixture.examCode);

        assertThat(roadmap.timeline().hasExamDate()).isTrue();
        assertThat(roadmap.timeline().daysRemaining()).isNull();
        assertThat(roadmap.timeline().dailyMinutesRequired()).isNull();
        assertThat(roadmap.topics()).isNotEmpty();
    }

    /* ------------------------------------------------------------------------------ scoping */

    /** One student's measured time can never become another's estimate. */
    @Test
    void oneStudentsMeasuredTimeIsNotUsedAsAnothersPersonalEstimate() {
        Fixture fixture = examWithSubject("scope", 1, 1);
        UUID topicId = fixture.topicIds.get(0);
        List<UUID> questionIds = createQuestions(fixture, topicId, 6);
        givePriority(fixture.examCode, topicId, "50.00");

        String owner = signUp("roadmap.owner." + runId + "@example.com");
        String other = signUp("roadmap.other." + runId + "@example.com");
        upload(owner, List.of(timedSession("session-scope-" + runId, questionIds, 3, 120_000)));

        assertThat(onlyTopic(roadmap(owner, fixture.examCode), topicId).estimate().source())
                .isEqualTo("PERSONAL_TOPIC");
        assertThat(onlyTopic(roadmap(other, fixture.examCode), topicId).estimate().source())
                .isNotEqualTo("PERSONAL_TOPIC");
    }

    /* ------------------------------------------------------------------------------ helpers */

    private record Fixture(String examCode, UUID subjectId, List<UUID> topicIds,
                           List<UUID> secondSubjectTopicIds) {
    }

    private StudyRoadmapResponse roadmap(String token, String examCode) {
        ResponseEntity<StudyRoadmapResponse> response = restTemplate.exchange(
                "/api/me/study-roadmap?examCode=" + examCode,
                HttpMethod.GET, authed(token, null), StudyRoadmapResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody();
    }

    private static RoadmapTopic onlyTopic(StudyRoadmapResponse response, UUID topicId) {
        return response.topics().stream()
                .filter(t -> t.topicId().equals(topicId))
                .findFirst()
                .orElseThrow(() -> new AssertionError("topic " + topicId + " missing from roadmap"));
    }

    /**
     * An inactive exam with {@code topicsPerSubject} topics under each of {@code subjects}
     * subjects, all mapped to the exam. Inactive so a fixture can never reach a real student.
     */
    private Fixture examWithSubject(String suffix, int subjects, int topicsPerSubject) {
        String code = ("ROADMAP_" + suffix + "_" + runId).toUpperCase();
        Map<String, Object> examPayload = Map.of(
                "code", code, "name", "Roadmap " + suffix + " " + runId,
                "active", false, "displayOrder", 995);
        ResponseEntity<Map> exam = restTemplate.postForEntity(
                "/api/exams", adminAuth(examPayload), Map.class);
        assertThat(exam.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdExamCodes.add(code);

        UUID firstSubject = createSubject("Roadmap " + suffix + " Subject A " + runId);
        List<UUID> first = new ArrayList<>();
        for (int i = 0; i < topicsPerSubject; i++) {
            first.add(createTopic(firstSubject, "Roadmap " + suffix + " A" + i));
        }

        List<UUID> second = new ArrayList<>();
        if (subjects > 1) {
            UUID secondSubject = createSubject("Roadmap " + suffix + " Subject B " + runId);
            for (int i = 0; i < topicsPerSubject; i++) {
                second.add(createTopic(secondSubject, "Roadmap " + suffix + " B" + i));
            }
        }

        List<UUID> all = new ArrayList<>(first);
        all.addAll(second);
        mapTopics(code, all);
        return new Fixture(code, firstSubject, first, second);
    }

    private UUID createSubject(String name) {
        SubjectRequest request = new SubjectRequest();
        request.setName(name);
        ResponseEntity<SubjectResponse> response = restTemplate.postForEntity(
                "/api/subjects", adminAuth(request), SubjectResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        UUID id = response.getBody().getId();
        createdSubjectIds.add(id);
        return id;
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
            en.setQuestionText("Roadmap fixture question " + runId + " #" + i + " for " + topicId);
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

    /** Epic L's priority row, written directly — the same fixture shape {@code WeaknessRadarTest}
     * uses, since the recompute derives priority from PYQ history a fixture exam has none of. */
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

    private void publishCycleWithExamStart(String examCode, LocalDate examStart) {
        RecruitmentCycle cycle = new RecruitmentCycle();
        cycle.setExam(examRepository.findById(examCode).orElseThrow());
        cycle.setCycleName("Roadmap fixture cycle " + runId);
        cycle.setCurrent(true);
        cycle.setContentStatus(ContentStatus.PUBLISHED);
        cycle.setExamStart(examStart);
        // Set explicitly: recruitment_cycles.created_at/updated_at are NOT NULL and this entity
        // has no @PrePersist — the real write path stamps them in ExamGuideService, so a fixture
        // saving through the repository has to do the same.
        cycle.setCreatedAt(OffsetDateTime.now());
        cycle.setUpdatedAt(OffsetDateTime.now());
        createdCycleIds.add(recruitmentCycleRepository.save(cycle).getId());
    }

    /** A practice session where every answer carries a real per-question time. */
    private ProgressDtos.PracticeSession timedSession(String id, List<UUID> questionIds,
                                                      int correct, int timeMsPerQuestion) {
        ProgressDtos.PracticeSession session = new ProgressDtos.PracticeSession();
        session.setId(id);
        session.setCompletedAt(OffsetDateTime.now().minusDays(1));
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
            r.setTimeMs(timeMsPerQuestion);
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
        request.setPassword("Roadmap@12345");
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
