package com.sarkaritaiyaari.backend.ingestion;

import com.sarkaritaiyaari.backend.entity.ExtractionConfidence;
import com.sarkaritaiyaari.backend.ingestion.QuestionRawExtractor.RawQuestionBlock;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * TASK-2501 Phase 2 -- turns one raw extraction block into a {@code question_candidates}
 * payload shaped as (a subset of) {@code CreateQuestionRequest}'s own field names.
 * {@code topicId}/{@code examCodes}/{@code difficulty} are deliberately absent -- a
 * rule-based Pass 1 has no way to know a freshly-extracted question's real taxonomy;
 * matching it is a reviewer action supplied as an override on Accept (see
 * {@code QuestionIngestionService#accept}), mirroring TASK-2401's own Document 9 precedent
 * for exam-guidance candidates.
 */
@Component
public class QuestionCandidateBuilder {

    public record BuiltCandidate(Map<String, Object> payload, ExtractionConfidence confidence, String sourceExcerpt) {
    }

    public BuiltCandidate build(RawQuestionBlock block) {
        Map<String, Object> translation = new LinkedHashMap<>();
        translation.put("languageCode", "en");
        translation.put("questionText", block.questionText());
        translation.put("options", block.options());
        translation.put("explanation", null);

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("questionType", "SINGLE_CHOICE");
        payload.put("correctAnswer", resolveCorrectAnswer(block));
        payload.put("translations", List.of(translation));

        return new BuiltCandidate(payload, confidence(block), sourceExcerpt(block));
    }

    /** {@code correctAnswer} is a letter A-D — the same shape {@code CreateQuestionRequest} already expects for SINGLE_CHOICE. */
    private static String resolveCorrectAnswer(RawQuestionBlock block) {
        if (block.answerText() == null) {
            return null;
        }
        char c = block.answerText().charAt(0);
        if (Character.isDigit(c)) {
            // Some papers key answers 1-4 rather than A-D.
            int index = Character.getNumericValue(c) - 1;
            if (index < 0 || index > 3) {
                return null;
            }
            return String.valueOf((char) ('A' + index));
        }
        return String.valueOf(Character.toUpperCase(c));
    }

    /**
     * HIGH only when the extraction found exactly 4 options and a resolvable answer letter —
     * everything a SINGLE_CHOICE question needs, unambiguously. MEDIUM when the options are
     * clean but no answer was found (common for a question-only paper with a separate
     * answer-key document, per TASK-2401's own investigation of real SSC papers). LOW
     * otherwise — malformed option count, or a block whose text never resolved options at
     * all — always routed to manual review, never guessed at further.
     */
    private static ExtractionConfidence confidence(RawQuestionBlock block) {
        if (block.options().size() != 4 || block.questionText().isBlank()) {
            return ExtractionConfidence.LOW;
        }
        return resolveCorrectAnswer(block) != null ? ExtractionConfidence.HIGH : ExtractionConfidence.MEDIUM;
    }

    private static String sourceExcerpt(RawQuestionBlock block) {
        String text = block.questionText();
        return text.length() > 300 ? text.substring(0, 300) + "…" : text;
    }
}
