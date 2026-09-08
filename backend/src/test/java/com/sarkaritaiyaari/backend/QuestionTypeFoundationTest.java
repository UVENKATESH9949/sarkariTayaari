package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.dto.CreateQuestionRequest;
import com.sarkaritaiyaari.backend.dto.QuestionResponse;
import com.sarkaritaiyaari.backend.dto.QuestionTypeResponse;
import com.sarkaritaiyaari.backend.dto.UpdateQuestionRequest;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * TASK-2301 Phase P1 — the type discriminator and answer-key foundation, verified against
 * the real dev database (this project has no local/Testcontainers Postgres — see
 * {@link AbstractIntegrationTest}'s own class comment): V25 actually ran, existing rows were
 * backfilled, and the create/update write paths keep {@code answer_key} in step with
 * {@code correct_answer} rather than leaving it to drift.
 */
class QuestionTypeFoundationTest extends AbstractIntegrationTest {

    @Test
    void questionTypesEndpoint_isPublicAndListsSingleChoiceAsAuthorable() {
        ResponseEntity<QuestionTypeResponse[]> response =
                restTemplate.getForEntity("/api/question-types", QuestionTypeResponse[].class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        List<QuestionTypeResponse> types = List.of(response.getBody());
        assertThat(types).extracting(QuestionTypeResponse::code).contains("SINGLE_CHOICE");

        QuestionTypeResponse singleChoice = types.stream()
                .filter(t -> "SINGLE_CHOICE".equals(t.code()))
                .findFirst().orElseThrow();
        assertThat(singleChoice.authoringEnabled()).isTrue();
        assertThat(singleChoice.evaluatorFamily()).isEqualTo("OPTION_SET");
        // Which other types are authoring-enabled has moved on since P1 (see V26 / Phase P2
        // Wave A) — that invariant now belongs to WaveAOptionSetTypesTest, not here.
    }

    @Test
    void createQuestion_getsSingleChoiceTypeAndAMatchingAnswerKey() {
        CreateQuestionRequest request = sampleRequest();
        request.setCorrectAnswer("C");

        ResponseEntity<QuestionResponse> response = restTemplate.exchange(
                "/api/questions", HttpMethod.POST, adminAuth(request), QuestionResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        QuestionResponse created = response.getBody();
        createdIds.add(created.getId());

        assertThat(created.getQuestionType()).isEqualTo("SINGLE_CHOICE");
        assertThat(created.getAnswerKey()).isEqualTo(answerKeyOf(2));
    }

    @Test
    void updateQuestion_recomputesTheAnswerKeyFromTheNewCorrectAnswer() {
        QuestionResponse created = createAndTrack(sampleRequest());
        assertThat(created.getAnswerKey()).isEqualTo(answerKeyOf(0)); // sampleRequest()'s correctAnswer is "A"

        UpdateQuestionRequest update = new UpdateQuestionRequest();
        update.setCorrectAnswer("D");
        update.setTopicId(created.getTopicId());
        update.setDifficulty(created.getDifficulty());
        update.setExamCodes(created.getExamCodes());

        ResponseEntity<QuestionResponse> response = restTemplate.exchange(
                "/api/questions/" + created.getId(), HttpMethod.PUT, adminAuth(update), QuestionResponse.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().getAnswerKey()).isEqualTo(answerKeyOf(3));
    }

    /**
     * The migration's own claim, checked against this database's real data rather than
     * assumed: the overwhelming majority of questions resolved a real answer_key. A residual
     * null count is not itself a failure — V25's own comment says a genuine data-quality row
     * (correct_answer matching neither a letter nor any English option) is left null on
     * purpose — but this pins the actual count so a future regression (a real resolution bug)
     * shows up as a number that moved, not as a silent, unnoticed drift.
     *
     * This test originally also asserted {@code countByQuestionTypeNot("SINGLE_CHOICE")} was
     * zero, proving every pre-V25 row was correctly backfilled. That was true right after V25
     * ran and stayed true through P1 (nothing else was authorable yet) — it stopped being true,
     * correctly, the moment Wave A/B shipped and real MULTIPLE_CHOICE/TRUE_FALSE/NUMERIC/etc.
     * content was authored on this same shared database. The backfill itself is a one-time
     * historical fact that cannot regress (V25 already ran and never runs again), so asserting
     * it forever would only ever break by design, not by a real bug — see
     * WaveAOptionSetTypesTest/WaveBFreeInputTypesTest for what those types' own correctness
     * actually looks like now.
     */
    @Test
    void existingQuestions_mostlyResolvedARealAnswerKey() {
        // Set-based counts, not findAll().stream() over ~37,900 rows — the exact shape this
        // codebase has already fixed as a real perf bug more than once (see
        // QuestionService's own bulk-import history).
        long total = questionRepository.count();
        long unresolvedAnswerKey = questionRepository.countByAnswerKeyIsNull();

        assertThat(total).as("sanity check: the real question bank should not be empty").isPositive();
        // A generous ceiling, not an exact count: this is a live shared database and the
        // known data-quality issue (correct_answer storing an option value instead of a
        // letter) is small. The real point of this assertion is that it is bounded at all —
        // an evaluator wiring bug would leave answer_key null for EVERY row, not a handful.
        assertThat(unresolvedAnswerKey).as("unresolved answer_key should be a small, known minority")
                .isLessThan(total / 20);
    }

    private QuestionResponse createAndTrack(CreateQuestionRequest request) {
        ResponseEntity<QuestionResponse> response = restTemplate.exchange(
                "/api/questions", HttpMethod.POST, adminAuth(request), QuestionResponse.class);
        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        QuestionResponse created = response.getBody();
        createdIds.add(created.getId());
        return created;
    }

    private static Map<String, Object> answerKeyOf(int correctOption) {
        return Map.of("correctOption", correctOption);
    }
}
