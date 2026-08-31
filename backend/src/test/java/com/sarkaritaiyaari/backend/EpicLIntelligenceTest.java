package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.CreateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.ExamTopicsRequest;
import com.sarkaritaiyaari.backend.dto.QuestionResponse;
import com.sarkaritaiyaari.backend.dto.SubjectRequest;
import com.sarkaritaiyaari.backend.dto.SubjectResponse;
import com.sarkaritaiyaari.backend.dto.TopicIntelligenceDtos;
import com.sarkaritaiyaari.backend.dto.TopicProgressDtos;
import com.sarkaritaiyaari.backend.dto.TopicRequest;
import com.sarkaritaiyaari.backend.dto.TopicResponse;
import com.sarkaritaiyaari.backend.dto.TranslationRequest;
import com.sarkaritaiyaari.backend.dto.UpdateQuestionRequest;
import com.sarkaritaiyaari.backend.entity.Exam;
import com.sarkaritaiyaari.backend.entity.Role;
import com.sarkaritaiyaari.backend.entity.TopicProgressState;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.entity.UserToken;
import com.sarkaritaiyaari.backend.repository.ExamStageRepository;
import com.sarkaritaiyaari.backend.repository.ExamTopicRepository;
import com.sarkaritaiyaari.backend.repository.QuestionDuplicateRepository;
import com.sarkaritaiyaari.backend.repository.TopicPriorityRepository;
import com.sarkaritaiyaari.backend.repository.TopicTrendRepository;
import com.sarkaritaiyaari.backend.repository.UserTopicProgressRepository;
import com.sarkaritaiyaari.backend.service.DuplicateDetectionService;
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
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Epic L, second slice — TICKET-2104 (PYQ provenance), 2105 (per-topic mastery),
 * 2106 (trend + priority, algorithm-versioned), 2107 (admin override), 2108 (real pattern
 * versioning) and 2109 (server-side duplicate detection).
 *
 * <p>Covers the parts that a schema cannot enforce and that reading the code would not catch:
 * cross-field clearing rules, the three-way priority split, last-write-wins on a mutable synced
 * table, the illegal state transitions, and the fact that a duplicate is recorded rather than
 * rejected.
 */
class EpicLIntelligenceTest extends AbstractIntegrationTest {

    @Autowired private ExamTopicRepository examTopicRepository;
    @Autowired private ExamStageRepository examStageRepository;
    @Autowired private TopicTrendRepository topicTrendRepository;
    @Autowired private TopicPriorityRepository topicPriorityRepository;
    @Autowired private QuestionDuplicateRepository questionDuplicateRepository;
    @Autowired private UserTopicProgressRepository topicProgressRepository;

    /** Unique per run, so a leftover row from a failed run cannot make a later run pass or fail. */
    private final String runId = UUID.randomUUID().toString().substring(0, 8);

    private User student;
    private String studentToken;

    /**
     * Same reason as TopicModelTest's: none of these tables cascade from topics/questions, so the
     * base class's deleteAllById would hit a foreign-key violation. JUnit runs a subclass
     * @AfterEach before the superclass one, so clearing the referencing rows here is enough.
     */
    @AfterEach
    void clearEpicLReferences() {
        if (!createdIds.isEmpty()) {
            questionDuplicateRepository.deleteAllInvolving(List.copyOf(createdIds));
        }
        for (String examCode : createdExamCodes) {
            topicTrendRepository.deleteByExamCode(examCode);
            topicPriorityRepository.deleteByExamCode(examCode);
            examTopicRepository.deleteByExamCode(examCode);
            // V3 deliberately does NOT cascade exams -> stages ("deleting an exam that has a
            // pattern should fail loudly"), so the versioning tests must clear their own stages
            // or the base class's exam delete hits exam_stages_exam_code_fkey. Papers and
            // sections do cascade from a stage, so deleting the stage is enough.
            examStageRepository.deleteAll(
                    examStageRepository.findByExamCodeOrderByDisplayOrderAsc(examCode));
        }
        for (UUID topicId : createdTopicIds) {
            topicProgressRepository.deleteByTopicId(topicId);
            topicTrendRepository.deleteByTopicId(topicId);
            topicPriorityRepository.deleteByTopicId(topicId);
            examTopicRepository.findByTopicId(topicId)
                    .forEach(row -> examTopicRepository.deleteById(row.getId()));
            topicRepository.deletePrerequisiteEdges(topicId);
        }
        if (student != null) {
            topicProgressRepository.deleteByUserId(student.getId());
            if (studentToken != null) userTokenRepository.deleteById(studentToken);
            userRepository.deleteById(student.getId());
            student = null;
            studentToken = null;
        }
    }

    /* ================================================ TICKET-2104: PYQ provenance */

    @Test
    void pyqProvenanceRoundTrips() {
        CreateQuestionRequest request = sampleRequest();
        request.setPyq(true);
        request.setPyqYear(2023);
        request.setPyqShift("Shift 2");
        request.setQuestionNumber(47);
        request.setSourceUrl("https://example.test/paper.pdf");

        QuestionResponse created = createQuestion(request);
        assertThat(created.isPyq()).isTrue();
        assertThat(created.getPyqYear()).isEqualTo(2023);
        assertThat(created.getPyqShift()).isEqualTo("Shift 2");
        assertThat(created.getQuestionNumber()).isEqualTo(47);
        assertThat(created.getSourceUrl()).isEqualTo("https://example.test/paper.pdf");
    }

    /**
     * The rule that only exists in {@code applyPyqProvenance} and cannot be a DB constraint.
     *
     * <p>Without it, un-ticking the PYQ box leaves a stale year on the row that
     * {@code aggregatePyqByTopicAndYear}'s not-null filter still sees, so the topic keeps
     * trending on a question nobody considers a PYQ. That is invisible in the UI and would only
     * ever surface as a trend nobody can explain.
     */
    @Test
    void unsettingPyqClearsTheYearButKeepsTheSourceUrl() {
        CreateQuestionRequest create = sampleRequest();
        create.setPyq(true);
        create.setPyqYear(2021);
        create.setPyqShift("Shift 1");
        create.setQuestionNumber(12);
        create.setSourceUrl("https://example.test/origin");
        QuestionResponse created = createQuestion(create);
        assertThat(created.getPyqYear()).isEqualTo(2021);

        UpdateQuestionRequest update = new UpdateQuestionRequest();
        update.setCorrectAnswer("A");
        update.setTopicId(testTopicId);
        update.setDifficulty("easy");
        update.setExamCodes(List.of(TEST_EXAM_CODE));
        update.setPyq(false);
        // Deliberately still sending a year — the server must ignore it, not store it.
        update.setPyqYear(2021);
        update.setSourceUrl("https://example.test/origin");

        ResponseEntity<QuestionResponse> response = restTemplate.exchange(
                "/api/questions/" + created.getId(), HttpMethod.PUT, adminAuth(update), QuestionResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);

        QuestionResponse updated = response.getBody();
        assertThat(updated).isNotNull();
        assertThat(updated.isPyq()).isFalse();
        assertThat(updated.getPyqYear()).isNull();
        assertThat(updated.getPyqShift()).isNull();
        assertThat(updated.getQuestionNumber()).isNull();
        // Survives on purpose: where a question came from stays true regardless of classification.
        assertThat(updated.getSourceUrl()).isEqualTo("https://example.test/origin");
    }

    @Test
    void absurdPyqYearIsRejected() {
        CreateQuestionRequest request = sampleRequest();
        request.setPyq(true);
        request.setPyqYear(202);

        ResponseEntity<Map> response = restTemplate.postForEntity(
                "/api/questions", adminAuth(request), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void unknownSourcePaperIsRejected() {
        CreateQuestionRequest request = sampleRequest();
        request.setPyq(true);
        request.setSourcePaperId(UUID.randomUUID());

        ResponseEntity<Map> response = restTemplate.postForEntity(
                "/api/questions", adminAuth(request), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    /* ============================================ TICKET-2109: duplicate detection */

    @Test
    void fingerprintIgnoresWhitespaceAndPunctuation() {
        // The whole point of the normalisation: these are the same question.
        assertThat(DuplicateDetectionService.fingerprint("What is 5 + 7?"))
                .isEqualTo(DuplicateDetectionService.fingerprint("what is 5+7 ?"));
        // And these are not.
        assertThat(DuplicateDetectionService.fingerprint("What is 5 + 7?"))
                .isNotEqualTo(DuplicateDetectionService.fingerprint("What is 5 + 8?"));
        // Text with nothing alphanumeric in it has no usable fingerprint.
        assertThat(DuplicateDetectionService.fingerprint("???")).isNull();
    }

    /**
     * A duplicate is <em>recorded</em>, not rejected. Supplied §14, and the behaviour an admin
     * depends on: two questions can share wording and still be different, so refusing the write
     * would make a legitimate one impossible to enter.
     */
    @Test
    void duplicateIsRecordedNotRejected() {
        String text = "Epic L duplicate probe " + runId + " — what is 5 + 7?";

        QuestionResponse first = createQuestion(withText(sampleRequest(), text));
        assertThat(first.getDuplicateOfQuestionIds()).isNull();

        // Same text, different punctuation and case: must still collide.
        QuestionResponse second = createQuestion(withText(sampleRequest(), text.toUpperCase() + "  "));

        assertThat(second.getId()).isNotNull();
        assertThat(second.getDuplicateOfQuestionIds())
                .as("the second question should be reported as a duplicate of the first")
                .containsExactly(first.getId());

        // And the edge is really on disk, pointing the right way round (newer -> older).
        var edges = questionDuplicateRepository.findAllInvolving(second.getId());
        assertThat(edges).hasSize(1);
        assertThat(edges.get(0).getQuestionId()).isEqualTo(second.getId());
        assertThat(edges.get(0).getDuplicateOfQuestionId()).isEqualTo(first.getId());
        assertThat(edges.get(0).getResolvedAt()).isNull();
    }

    @Test
    void editingTheEnglishTextMovesTheFingerprint() {
        String original = "Epic L fingerprint drift " + runId;
        QuestionResponse created = createQuestion(withText(sampleRequest(), original));

        // A question that matched the *old* text must no longer match after an edit — otherwise
        // the stored fingerprint describes wording that no longer exists anywhere.
        var beforeEdit = restTemplate.exchange(
                "/api/question-duplicates/check", HttpMethod.POST,
                adminAuth(Map.of("questionText", original)), Map.class);
        assertThat(((Number) beforeEdit.getBody().get("matchCount")).intValue()).isEqualTo(1);

        restTemplate.exchange(
                "/api/questions/" + created.getId() + "/translations/en", HttpMethod.PUT,
                adminAuth(Map.of(
                        "questionText", original + " (revised)",
                        "options", List.of("One", "Two", "Three", "Four"),
                        "explanation", "Because.")),
                Map.class);

        var afterEdit = restTemplate.exchange(
                "/api/question-duplicates/check", HttpMethod.POST,
                adminAuth(Map.of("questionText", original)), Map.class);
        assertThat(((Number) afterEdit.getBody().get("matchCount")).intValue()).isZero();
    }

    /* ======================================= TICKET-2106/2107: trend and priority */

    /**
     * The three-way priority split, end to end through the API.
     *
     * <p>This is TICKET-2107's whole requirement (supplied §66): an override must never overwrite
     * the computed value. Asserting that {@code systemPriority} is unchanged <em>after</em> an
     * override is the test that would fail if someone "simplified" the three columns into one.
     */
    @Test
    void adminOverrideNeverOverwritesTheComputedScore() {
        Fixture fixture = createExamWithMappedTopic("Override");

        recompute(fixture.examCode);
        TopicIntelligenceDtos.TopicIntelligence before = fetchTopic(fixture.examCode, fixture.topicId);
        assertThat(before.systemPriority()).isNotNull();
        assertThat(before.adminOverride()).isNull();
        assertThat(before.finalPriority()).isEqualByComparingTo(before.systemPriority());

        TopicIntelligenceDtos.OverrideRequest override = new TopicIntelligenceDtos.OverrideRequest();
        override.setPriority(new BigDecimal("95.00"));
        override.setReason("Examined far more heavily than the PYQ sample suggests.");

        ResponseEntity<TopicIntelligenceDtos.TopicIntelligence> response = restTemplate.exchange(
                "/api/exams/" + fixture.examCode + "/topics/" + fixture.topicId + "/priority-override",
                HttpMethod.PUT, adminAuth(override), TopicIntelligenceDtos.TopicIntelligence.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);

        TopicIntelligenceDtos.TopicIntelligence after = fetchTopic(fixture.examCode, fixture.topicId);
        assertThat(after.adminOverride()).isEqualByComparingTo("95.00");
        assertThat(after.finalPriority()).isEqualByComparingTo("95.00");
        assertThat(after.systemPriority())
                .as("the computed score must survive an override untouched")
                .isEqualByComparingTo(before.systemPriority());
        assertThat(after.overrideReason()).contains("more heavily");
    }

    @Test
    void overrideWithoutAReasonIsRejected() {
        Fixture fixture = createExamWithMappedTopic("NoReason");
        recompute(fixture.examCode);

        TopicIntelligenceDtos.OverrideRequest override = new TopicIntelligenceDtos.OverrideRequest();
        override.setPriority(new BigDecimal("50.00"));
        override.setReason("   ");

        ResponseEntity<Map> response = restTemplate.exchange(
                "/api/exams/" + fixture.examCode + "/topics/" + fixture.topicId + "/priority-override",
                HttpMethod.PUT, adminAuth(override), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void clearingAnOverrideRestoresTheComputedScore() {
        Fixture fixture = createExamWithMappedTopic("Clear");
        recompute(fixture.examCode);
        BigDecimal system = fetchTopic(fixture.examCode, fixture.topicId).systemPriority();

        TopicIntelligenceDtos.OverrideRequest set = new TopicIntelligenceDtos.OverrideRequest();
        set.setPriority(new BigDecimal("10.00"));
        set.setReason("Temporarily deprioritised.");
        restTemplate.exchange(
                "/api/exams/" + fixture.examCode + "/topics/" + fixture.topicId + "/priority-override",
                HttpMethod.PUT, adminAuth(set), TopicIntelligenceDtos.TopicIntelligence.class);

        // A null priority is the documented way to clear — hence nullable rather than defaulted.
        TopicIntelligenceDtos.OverrideRequest clear = new TopicIntelligenceDtos.OverrideRequest();
        clear.setPriority(null);
        restTemplate.exchange(
                "/api/exams/" + fixture.examCode + "/topics/" + fixture.topicId + "/priority-override",
                HttpMethod.PUT, adminAuth(clear), TopicIntelligenceDtos.TopicIntelligence.class);

        TopicIntelligenceDtos.TopicIntelligence after = fetchTopic(fixture.examCode, fixture.topicId);
        assertThat(after.adminOverride()).isNull();
        assertThat(after.overrideReason()).isNull();
        assertThat(after.finalPriority()).isEqualByComparingTo(system);
    }

    /**
     * A recompute must carry existing overrides forward.
     *
     * <p>Without this the recalculation job silently discards every editorial decision ever made,
     * which is the exact outcome §66 exists to prevent — and it would look like it worked.
     */
    @Test
    void recomputeCarriesOverridesForward() {
        Fixture fixture = createExamWithMappedTopic("CarryForward");
        recompute(fixture.examCode);

        TopicIntelligenceDtos.OverrideRequest override = new TopicIntelligenceDtos.OverrideRequest();
        override.setPriority(new BigDecimal("88.00"));
        override.setReason("Editorial judgement, must survive a recompute.");
        restTemplate.exchange(
                "/api/exams/" + fixture.examCode + "/topics/" + fixture.topicId + "/priority-override",
                HttpMethod.PUT, adminAuth(override), TopicIntelligenceDtos.TopicIntelligence.class);

        TopicIntelligenceDtos.RecomputeResponse result = recompute(fixture.examCode);
        assertThat(result.overridesCarriedForward()).isGreaterThanOrEqualTo(1);

        TopicIntelligenceDtos.TopicIntelligence after = fetchTopic(fixture.examCode, fixture.topicId);
        assertThat(after.adminOverride()).isEqualByComparingTo("88.00");
        assertThat(after.finalPriority()).isEqualByComparingTo("88.00");
    }

    /**
     * With nothing tagged, the honest answer is INSUFFICIENT_DATA — not a fabricated "stable".
     */
    @Test
    void untaggedTopicReportsInsufficientDataRatherThanAFakeTrend() {
        Fixture fixture = createExamWithMappedTopic("NoPyq");
        TopicIntelligenceDtos.RecomputeResponse result = recompute(fixture.examCode);
        assertThat(result.pyqTaggedCount()).isZero();

        TopicIntelligenceDtos.TopicIntelligence topic = fetchTopic(fixture.examCode, fixture.topicId);
        assertThat(topic.trendDirection()).isEqualTo("INSUFFICIENT_DATA");
        assertThat(topic.appearanceCount()).isZero();
        assertThat(topic.computedWeightagePercent()).isNull();
        // The curated figure still stands on its own — a missing trend does not erase it.
        assertThat(topic.curatedWeightagePercent()).isNotNull();
    }

    @Test
    void everyScoreRecordsItsAlgorithmVersionAndInputs() {
        Fixture fixture = createExamWithMappedTopic("Audit");
        recompute(fixture.examCode);

        TopicIntelligenceDtos.TopicIntelligence topic = fetchTopic(fixture.examCode, fixture.topicId);
        assertThat(topic.algorithmVersion()).isEqualTo(TopicIntelligenceService.ALGORITHM_VERSION);
        // §67 auditability: a stored score has to stay explainable after the formula changes.
        assertThat(topic.inputs()).isNotNull();
        assertThat(topic.inputs()).containsKeys("weightageSource", "weights", "relativeWeightage");
    }

    /* ============================================== TICKET-2105: per-topic mastery */

    @Test
    void topicProgressUploadsAndRestores() {
        signInAsStudent();

        TopicProgressDtos.TopicProgress row = progressRow(testTopicId, "PRACTICING", 60, 30, 50);
        TopicProgressDtos.SyncResponse stored = uploadProgress(List.of(row));
        assertThat(stored.stored()).isEqualTo(1);
        assertThat(stored.rejected()).isZero();

        TopicProgressDtos.RestoreResponse restored = restoreProgress();
        assertThat(restored.topics()).hasSize(1);
        var only = restored.topics().get(0);
        assertThat(only.topicId()).isEqualTo(testTopicId);
        assertThat(only.state()).isEqualTo("PRACTICING");
        assertThat(only.attemptedCount()).isEqualTo(60);
        assertThat(only.correctCount()).isEqualTo(30);
        // The restore carries display names so a fresh install is useful before the content sync.
        assertThat(only.topicName()).isEqualTo(TEST_TOPIC_NAME);
        assertThat(only.subjectName()).isEqualTo(TEST_SUBJECT_NAME);
    }

    /**
     * Last-write-wins, in the direction that matters: a stale replay must not roll progress back.
     */
    @Test
    void staleTopicProgressIsIgnored() {
        signInAsStudent();

        TopicProgressDtos.TopicProgress newer = progressRow(testTopicId, "MASTERED", 100, 90, 90);
        newer.setUpdatedAt(OffsetDateTime.now());
        assertThat(uploadProgress(List.of(newer)).stored()).isEqualTo(1);

        // An older snapshot from another device, replayed late.
        TopicProgressDtos.TopicProgress older = progressRow(testTopicId, "LEARNING", 5, 1, 20);
        older.setUpdatedAt(OffsetDateTime.now().minusDays(2));
        TopicProgressDtos.SyncResponse result = uploadProgress(List.of(older));
        // Neither stored nor counted as rejected: it is a no-op the protocol expects.
        assertThat(result.stored()).isZero();

        assertThat(restoreProgress().topics().get(0).state()).isEqualTo("MASTERED");
    }

    @Test
    void unknownStateAndImpossibleCountsAreRejectedWithoutFailingTheBatch() {
        signInAsStudent();

        TopicProgressDtos.TopicProgress bogusState = progressRow(testTopicId, "TOTALLY_MASTERED", 10, 5, 50);
        TopicProgressDtos.SyncResponse result = uploadProgress(List.of(bogusState));
        assertThat(result.stored()).isZero();
        assertThat(result.rejected()).isEqualTo(1);

        // correct > attempted is arithmetically impossible and would poison every average.
        TopicProgressDtos.TopicProgress impossible = progressRow(testTopicId, "PRACTICING", 5, 9, 50);
        TopicProgressDtos.SyncResponse second = uploadProgress(List.of(impossible));
        assertThat(second.stored()).isZero();
        assertThat(second.rejected()).isEqualTo(1);
    }

    /**
     * NEEDS_REVISION is only reachable from MASTERED, and nothing may return to NOT_STARTED.
     * A DB CHECK can constrain the value but not the legal moves between values.
     */
    @Test
    void illegalStateTransitionsAreRejected() {
        assertThat(TopicProgressState.LEARNING.canTransitionTo(TopicProgressState.NEEDS_REVISION)).isFalse();
        assertThat(TopicProgressState.MASTERED.canTransitionTo(TopicProgressState.NEEDS_REVISION)).isTrue();
        assertThat(TopicProgressState.MASTERED.canTransitionTo(TopicProgressState.NOT_STARTED)).isFalse();
        assertThat(TopicProgressState.PRACTICING.canTransitionTo(TopicProgressState.MASTERED)).isTrue();

        signInAsStudent();
        TopicProgressDtos.TopicProgress learning = progressRow(testTopicId, "LEARNING", 4, 2, 50);
        assertThat(uploadProgress(List.of(learning)).stored()).isEqualTo(1);

        TopicProgressDtos.TopicProgress regressed = progressRow(testTopicId, "NEEDS_REVISION", 8, 3, 37);
        regressed.setUpdatedAt(OffsetDateTime.now().plusSeconds(5));
        TopicProgressDtos.SyncResponse result = uploadProgress(List.of(regressed));
        assertThat(result.stored()).isZero();
        assertThat(result.rejected()).isEqualTo(1);
    }

    @Test
    void topicProgressRequiresAuthentication() {
        ResponseEntity<Map> response = restTemplate.getForEntity("/api/topic-progress", Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    /* ========================================== TICKET-2108: real pattern versioning */

    /**
     * Two versions of one stage must be able to coexist — the entire point of the ticket. Before
     * V16 the {@code UNIQUE (exam_code, name)} constraint and a name-only service check both
     * forbade it, so versioning was a label with no behaviour.
     */
    @Test
    void twoVersionsOfTheSameStageCanCoexist() {
        String examCode = createExam("VER");

        UUID older = createStage(examCode, "Tier 2", "2018 pattern", "2018-01-01", "2021-12-31");
        UUID newer = createStage(examCode, "Tier 2", "2022 pattern", "2022-01-01", null);
        assertThat(older).isNotEqualTo(newer);

        // The admin view keeps both, flagged, so history stays editable.
        ResponseEntity<Map> structure = restTemplate.exchange(
                "/api/exams/" + examCode + "/structure", HttpMethod.GET, adminAuth(), Map.class);
        assertThat(structure.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<Map<String, Object>> stages = (List<Map<String, Object>>) structure.getBody().get("stages");
        assertThat(stages).hasSize(2);

        long activeCount = stages.stream().filter(s -> Boolean.TRUE.equals(s.get("active"))).count();
        assertThat(activeCount)
                .as("exactly one version of a stage may be in force at a time")
                .isEqualTo(1);
        Map<String, Object> active = stages.stream()
                .filter(s -> Boolean.TRUE.equals(s.get("active")))
                .findFirst().orElseThrow();
        assertThat(active.get("versionLabel")).isEqualTo("2022 pattern");
    }

    @Test
    void sameStageNameAtTheSameVersionIsStillRejected() {
        String examCode = createExam("DUPVER");
        createStage(examCode, "Prelims", "2024 pattern", null, null);

        Map<String, Object> duplicate = Map.of(
                "examCode", examCode, "name", "Prelims", "displayOrder", 2, "versionLabel", "2024 pattern");
        ResponseEntity<Map> response = restTemplate.postForEntity(
                "/api/exam-stages", adminAuth(duplicate), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    void backwardsEffectivityWindowIsRejected() {
        String examCode = createExam("WINDOW");
        Map<String, Object> backwards = Map.of(
                "examCode", examCode, "name", "Tier 1", "displayOrder", 1,
                "effectiveFrom", "2024-01-01", "effectiveTo", "2023-01-01");
        ResponseEntity<Map> response = restTemplate.postForEntity(
                "/api/exam-stages", adminAuth(backwards), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    /* ========================================================================= Helpers */

    private record Fixture(String examCode, UUID subjectId, UUID topicId) {
    }

    private CreateQuestionRequest withText(CreateQuestionRequest request, String text) {
        TranslationRequest en = new TranslationRequest();
        en.setLanguageCode("en");
        en.setQuestionText(text);
        en.setOptions(List.of("One", "Two", "Three", "Four"));
        en.setExplanation("Because.");
        request.setTranslations(List.of(en));
        return request;
    }

    private QuestionResponse createQuestion(CreateQuestionRequest request) {
        ResponseEntity<QuestionResponse> response = restTemplate.postForEntity(
                "/api/questions", adminAuth(request), QuestionResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        QuestionResponse body = response.getBody();
        assertThat(body).isNotNull();
        createdIds.add(body.getId());
        return body;
    }

    private String createExam(String suffix) {
        String code = ("EPICL_" + suffix + "_" + runId).toUpperCase();
        Map<String, Object> payload = Map.of(
                "code", code, "name", "Epic L " + suffix + " " + runId,
                "active", false, "displayOrder", 998);
        ResponseEntity<Map> response = restTemplate.postForEntity("/api/exams", adminAuth(payload), Map.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        createdExamCodes.add(code);
        return code;
    }

    /** An exam with one subject, one topic, and that topic mapped with a curated weightage. */
    private Fixture createExamWithMappedTopic(String suffix) {
        String examCode = createExam(suffix);

        SubjectRequest subjectRequest = new SubjectRequest();
        subjectRequest.setName("Epic L " + suffix + " Subject " + runId);
        ResponseEntity<SubjectResponse> subject = restTemplate.postForEntity(
                "/api/subjects", adminAuth(subjectRequest), SubjectResponse.class);
        assertThat(subject.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        UUID subjectId = subject.getBody().getId();
        createdSubjectIds.add(subjectId);

        TopicRequest topicRequest = new TopicRequest();
        topicRequest.setSubjectId(subjectId);
        topicRequest.setName("Epic L " + suffix + " Topic");
        topicRequest.setDisplayOrder(1);
        ResponseEntity<TopicResponse> topic = restTemplate.postForEntity(
                "/api/topics", adminAuth(topicRequest), TopicResponse.class);
        assertThat(topic.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        UUID topicId = topic.getBody().getId();
        createdTopicIds.add(topicId);

        ExamTopicsRequest.Entry entry = new ExamTopicsRequest.Entry();
        entry.setTopicId(topicId);
        entry.setWeightagePercent(new BigDecimal("12.50"));
        ExamTopicsRequest mapRequest = new ExamTopicsRequest();
        mapRequest.setTopics(List.of(entry));
        ResponseEntity<List> mapped = restTemplate.exchange(
                "/api/exams/" + examCode + "/topics", HttpMethod.PUT, adminAuth(mapRequest), List.class);
        assertThat(mapped.getStatusCode()).isEqualTo(HttpStatus.OK);

        return new Fixture(examCode, subjectId, topicId);
    }

    private UUID createStage(String examCode, String name, String versionLabel,
                              String effectiveFrom, String effectiveTo) {
        Map<String, Object> payload = new java.util.HashMap<>();
        payload.put("examCode", examCode);
        payload.put("name", name);
        payload.put("displayOrder", 1);
        if (versionLabel != null) payload.put("versionLabel", versionLabel);
        if (effectiveFrom != null) payload.put("effectiveFrom", effectiveFrom);
        if (effectiveTo != null) payload.put("effectiveTo", effectiveTo);

        ResponseEntity<Map> response = restTemplate.postForEntity(
                "/api/exam-stages", adminAuth(payload), Map.class);
        assertThat(response.getStatusCode())
                .as("creating stage %s / %s", name, versionLabel)
                .isEqualTo(HttpStatus.CREATED);
        return UUID.fromString((String) response.getBody().get("id"));
    }

    private TopicIntelligenceDtos.RecomputeResponse recompute(String examCode) {
        ResponseEntity<TopicIntelligenceDtos.RecomputeResponse> response = restTemplate.postForEntity(
                "/api/exams/" + examCode + "/topic-intelligence/recompute",
                adminAuth(null), TopicIntelligenceDtos.RecomputeResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody();
    }

    private TopicIntelligenceDtos.TopicIntelligence fetchTopic(String examCode, UUID topicId) {
        ResponseEntity<TopicIntelligenceDtos.ExamTopicIntelligenceResponse> response =
                restTemplate.getForEntity(
                        "/api/exams/" + examCode + "/topic-intelligence",
                        TopicIntelligenceDtos.ExamTopicIntelligenceResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody().topics().stream()
                .filter(t -> t.topicId().equals(topicId))
                .findFirst()
                .orElseThrow(() -> new AssertionError("topic " + topicId + " missing from response"));
    }

    /**
     * A throwaway STUDENT with a fabricated token — the progress endpoints are user-scoped, so
     * these tests cannot reuse the admin fixture without asserting on the wrong user's rows.
     */
    private void signInAsStudent() {
        User user = new User();
        user.setEmail("epic-l-student-" + runId + "@sarkaritaiyaari.internal");
        user.setPasswordHash("unused-in-tests");
        user.setRole(Role.STUDENT);
        student = userRepository.save(user);

        UserToken token = new UserToken();
        token.setToken("epic-l-student-token-" + UUID.randomUUID());
        token.setUser(student);
        token.setExpiresAt(OffsetDateTime.now().plusHours(1));
        userTokenRepository.save(token);
        studentToken = token.getToken();
    }

    private <T> HttpEntity<T> studentAuth(T body) {
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.AUTHORIZATION, "Bearer " + studentToken);
        return new HttpEntity<>(body, headers);
    }

    private TopicProgressDtos.TopicProgress progressRow(UUID topicId, String state,
                                                         int attempted, int correct, int accuracy) {
        TopicProgressDtos.TopicProgress row = new TopicProgressDtos.TopicProgress();
        row.setTopicId(topicId);
        row.setState(state);
        row.setAttemptedCount(attempted);
        row.setCorrectCount(correct);
        row.setAccuracyPercent(new BigDecimal(accuracy));
        row.setTotalTimeMs(120_000L);
        row.setLastPracticedAt(OffsetDateTime.now());
        row.setUpdatedAt(OffsetDateTime.now());
        return row;
    }

    private TopicProgressDtos.SyncResponse uploadProgress(List<TopicProgressDtos.TopicProgress> rows) {
        TopicProgressDtos.SyncRequest request = new TopicProgressDtos.SyncRequest();
        request.setTopics(rows);
        ResponseEntity<TopicProgressDtos.SyncResponse> response = restTemplate.postForEntity(
                "/api/topic-progress/sync", studentAuth(request), TopicProgressDtos.SyncResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody();
    }

    private TopicProgressDtos.RestoreResponse restoreProgress() {
        ResponseEntity<TopicProgressDtos.RestoreResponse> response = restTemplate.exchange(
                "/api/topic-progress", HttpMethod.GET, studentAuth(null),
                TopicProgressDtos.RestoreResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        return response.getBody();
    }
}
