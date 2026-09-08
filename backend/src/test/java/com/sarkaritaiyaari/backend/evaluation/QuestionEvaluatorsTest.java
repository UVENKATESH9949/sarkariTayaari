package com.sarkaritaiyaari.backend.evaluation;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Every case in {@code sample-data/question-evaluator-fixtures.json}, run against
 * {@link QuestionEvaluators}'s dispatch — SingleChoiceEvaluatorTest's original scope (P1)
 * widened across every later phase (P2 Wave A's MULTIPLE_CHOICE/TRUE_FALSE, P2 Wave B's
 * NUMERIC/FILL_BLANK/MATCH/ORDERING, P4's LONG_ANSWER/SHORT_ANSWER) since each landed its
 * own cases in the same fixture file rather than a dedicated test class. No Spring
 * context, same reasoning as {@code TopicHealthScoringTest}: these evaluators take plain
 * maps and return a result, so booting Spring would add time and a network dependency to
 * test no arithmetic needs.
 *
 * ASSERTION_REASON, STATEMENT_COMBINATION (reusing {@link SingleChoiceEvaluator}) and
 * SHORT_ANSWER (reusing {@link ManualEvaluator}) have no cases of their own here — each
 * shares an evaluator instance with a type that already has cases (see
 * {@link QuestionEvaluators}), so nothing new to prove.
 *
 * The fixture file is shared with the TypeScript mirror
 * ({@code mobile/src/evaluation/questionEvaluator.ts}), which has no test runner in this
 * project — its correctness against these same cases is verified by reading and by tracing
 * them by hand, stated in the fixture file's own comment rather than implied here.
 */
class QuestionEvaluatorsTest {

    private static final Path FIXTURES = Path.of("..", "sample-data", "question-evaluator-fixtures.json");

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void everyFixtureCaseHolds() throws Exception {
        JsonNode root = mapper.readTree(Files.readString(FIXTURES));

        for (JsonNode c : root.get("cases")) {
            String name = c.get("name").asText();
            String questionType = c.get("questionType").asText();
            Map<String, Object> answerKey = toMap(c.get("answerKey"));
            Map<String, Object> response = toMap(c.get("response"));

            EvaluationResult result = QuestionEvaluators.forType(questionType).evaluate(answerKey, null, response);

            JsonNode expect = c.get("expect");
            assertThat(result.outcome())
                    .as("case '%s' (%s) outcome", name, questionType)
                    .isEqualTo(EvaluationOutcome.valueOf(expect.get("outcome").asText()));
            assertThat(result.scoreFraction())
                    .as("case '%s' (%s) scoreFraction", name, questionType)
                    .isEqualTo(expect.get("scoreFraction").asDouble());
        }
    }

    private Map<String, Object> toMap(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        return mapper.convertValue(node, new TypeReference<>() {
        });
    }
}
