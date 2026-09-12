package com.sarkaritaiyaari.backend.ai.content;

import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * TASK-2701 Phase 2. The check behind AI_ARCHITECTURE.md §8's central claim: "the model is never
 * asked to choose the answer, so an explanation asserting a different one is a mechanical
 * mismatch, not a judgement call."
 *
 * This is a deliberate line-for-line mirror of {@code answerMatches} in
 * {@code packages/core/src/ai/schema/validate.ts}. It exists twice because generation happens
 * here, in Java, while the mobile/web client independently re-validates anything it ever caches
 * client-side (Phase 3) using the TypeScript version. Both sides are asserted against the same
 * {@code sample-data/ai-answer-grounding-fixtures.json} -- see {@code AiAnswerGroundingTest} and
 * {@code validate.test.ts}'s "shared fixture parity" block -- the same discipline this codebase
 * already uses for {@code QuestionEvaluatorsTest}/{@code questionEvaluator.test.ts} and for
 * {@code scripts/check-topic-health-parity.js}.
 *
 * Tolerant of form (casing, whitespace, an option label, letter-versus-text -- real data
 * carries both since {@code questions.correct_answer} was widened from {@code VARCHAR(10)} in
 * V28), strict about substance. A validator that rejects correctly-formed correct answers gets
 * routed around by whoever operates it, which defeats the whole point.
 */
public final class AiAnswerGrounding {

    /** Strips a leading option label a model adds unprompted: "A)", "(B)", "C.", "D -". */
    private static final Pattern OPTION_LABEL = Pattern.compile("^\\s*\\(?\\s*[a-dA-D]\\s*\\)?\\s*[.):\\-—]\\s*");

    private static final Pattern BARE_LETTER = Pattern.compile("^\\(?[a-dA-D]\\)?$");

    private AiAnswerGrounding() {
    }

    /**
     * Whether {@code claimedAnswer} (from a generated explanation) matches {@code correctAnswer}
     * (the verified value already stored on the question), given the question's options so a
     * letter can resolve to its option text in either direction.
     */
    public static boolean groundedAnswer(String claimedAnswer, String correctAnswer, List<String> options) {
        if (claimedAnswer == null || correctAnswer == null) {
            return false;
        }

        List<String> claimedForms = List.of(
                normalise(claimedAnswer),
                normalise(stripOptionLabel(claimedAnswer)),
                normalise(resolveToOptionText(claimedAnswer, options)),
                normalise(resolveToOptionText(stripOptionLabel(claimedAnswer), options)));

        List<String> correctForms = List.of(
                normalise(correctAnswer),
                normalise(stripOptionLabel(correctAnswer)),
                normalise(resolveToOptionText(correctAnswer, options)));

        for (String correctForm : correctForms) {
            if (!correctForm.isEmpty() && claimedForms.contains(correctForm)) {
                return true;
            }
        }
        return false;
    }

    private static String normalise(String value) {
        return value.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }

    private static String stripOptionLabel(String value) {
        return OPTION_LABEL.matcher(value).replaceFirst("").trim();
    }

    private static String resolveToOptionText(String value, List<String> options) {
        String trimmed = value.trim();
        if (!BARE_LETTER.matcher(trimmed).matches()) {
            return trimmed;
        }
        int index = Character.toUpperCase(trimmed.replaceAll("[()]", "").charAt(0)) - 'A';
        return (index >= 0 && index < options.size()) ? options.get(index) : trimmed;
    }
}
