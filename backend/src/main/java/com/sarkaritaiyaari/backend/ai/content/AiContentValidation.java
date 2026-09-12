package com.sarkaritaiyaari.backend.ai.content;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * TASK-2701 Phase 2 -- parses and validates a generated response before it is ever persisted.
 * A Java-side mirror of {@code packages/core/src/ai/schema/validate.ts}'s shape checks, scoped
 * to the two tasks this generation pipeline produces ({@code QUESTION_EXPLANATION} and
 * {@code CONCEPT_EXPLANATION}). Nothing here throws on malformed input -- a bad response is a
 * value, because the caller's job on failure is to skip the item and keep going through the
 * batch, never to abort it (AI_ARCHITECTURE.md §11: AI is an enhancement layer, and this
 * pipeline is the one place that decides what is worth showing a reviewer at all).
 */
public final class AiContentValidation {

    private AiContentValidation() {
    }

    public sealed interface Result permits Ok, Failed {
    }

    public record Ok(Map<String, Object> payload) implements Result {
    }

    /**
     * {@code code} matches the failure vocabulary in {@code validate.ts} ({@code MISSING_FIELD},
     * {@code EMPTY_FIELD}, {@code UNGROUNDED_ANSWER}, ...) so a generation-summary log line reads
     * the same regardless of which side produced it.
     */
    public record Failed(String code, String detail) implements Result {
    }

    /** Validates a QUESTION_EXPLANATION response against the question it was generated for. */
    public static Result validateQuestionExplanation(JsonNode raw, String correctAnswer, List<String> options) {
        if (raw == null || !raw.isObject()) {
            return new Failed("NOT_AN_OBJECT", "response was not a JSON object");
        }

        String answer = requiredText(raw, "answer");
        if (answer == null) {
            return missingOrEmpty(raw, "answer");
        }
        String whyCorrect = requiredText(raw, "whyCorrect");
        if (whyCorrect == null) {
            return missingOrEmpty(raw, "whyCorrect");
        }

        if (!AiAnswerGrounding.groundedAnswer(answer, correctAnswer, options)) {
            return new Failed("UNGROUNDED_ANSWER",
                    "model answered \"" + answer + "\" but the verified answer is \"" + correctAnswer + "\"");
        }

        List<Map<String, Object>> whyOthersWrong = new ArrayList<>();
        JsonNode wrongNode = raw.get("whyOthersWrong");
        if (wrongNode != null && !wrongNode.isNull()) {
            if (!wrongNode.isArray()) {
                return new Failed("WRONG_TYPE", "whyOthersWrong must be an array");
            }
            for (JsonNode entry : wrongNode) {
                String option = requiredText(entry, "option");
                String why = requiredText(entry, "why");
                if (option == null || why == null) {
                    return new Failed("MISSING_FIELD", "whyOthersWrong entry missing option/why");
                }
                whyOthersWrong.add(Map.of("option", option, "why", why));
            }
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("taskId", "QUESTION_EXPLANATION");
        payload.put("answer", answer);
        payload.put("whyCorrect", whyCorrect);
        payload.put("whyOthersWrong", whyOthersWrong);
        payload.put("concept", optionalText(raw, "concept"));
        payload.put("examTip", optionalText(raw, "examTip"));
        return new Ok(payload);
    }

    /** Validates a CONCEPT_EXPLANATION response. No answer to ground -- a topic has none. */
    public static Result validateConceptExplanation(JsonNode raw) {
        if (raw == null || !raw.isObject()) {
            return new Failed("NOT_AN_OBJECT", "response was not a JSON object");
        }

        String concept = requiredText(raw, "concept");
        if (concept == null) {
            return missingOrEmpty(raw, "concept");
        }
        String explanation = requiredText(raw, "explanation");
        if (explanation == null) {
            return missingOrEmpty(raw, "explanation");
        }

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("taskId", "CONCEPT_EXPLANATION");
        payload.put("concept", concept);
        payload.put("explanation", explanation);
        payload.put("examTip", optionalText(raw, "examTip"));
        return new Ok(payload);
    }

    private static Result missingOrEmpty(JsonNode raw, String field) {
        JsonNode node = raw.get(field);
        String code = (node == null || node.isNull()) ? "MISSING_FIELD" : "EMPTY_FIELD";
        return new Failed(code, field);
    }

    private static String requiredText(JsonNode node, String field) {
        if (node == null) {
            return null;
        }
        JsonNode value = node.get(field);
        if (value == null || value.isNull() || !value.isTextual()) {
            return null;
        }
        String trimmed = value.asText().trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String optionalText(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || value.isNull() || !value.isTextual()) {
            return null;
        }
        String trimmed = value.asText().trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
