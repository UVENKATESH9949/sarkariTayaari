package com.sarkaritaiyaari.backend.ai.feedback;

import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Phase 7. A deliberate line-for-line mirror of {@code groundedNarrative} in
 * {@code packages/core/src/ai/schema/validate.ts} -- same reasoning as
 * {@code AiAnswerGrounding}/{@code answerMatches} existing twice: this side generates
 * {@code SESSION_FEEDBACK}/{@code PROFILE_SUMMARY} narratives, the TypeScript side is what a
 * client would re-check if it ever cached one. Both are asserted against one shared fixture
 * file -- see {@code PersonalNarrativeGroundingTest} and {@code validate.test.ts}'s
 * "groundedNarrative" block.
 *
 * Deliberately does NOT attempt full topic-name hallucination-proofing (see the TypeScript
 * version's own doc comment for why that is an honest scope limit, not an oversight) -- it
 * checks every numeral the narrative cites is traceable to a given fact, and that the narrative
 * names at least one topic it was actually given, when any were supplied.
 */
public final class PersonalNarrativeGrounding {

    private static final Pattern NUMBER = Pattern.compile("\\d+(\\.\\d+)?");

    private PersonalNarrativeGrounding() {
    }

    /** Every number/topic name a narrative may cite. Built from the same facts the prompt used. */
    public record Grounding(List<Integer> allowedNumbers, List<String> allowedTopicNames) {
    }

    /**
     * The first number the narrative cited that was not among {@code grounding.allowedNumbers()},
     * or {@code null} if every number checks out.
     */
    public static String firstUngroundedNumber(String narrative, Grounding grounding) {
        List<String> allowed = grounding.allowedNumbers().stream().map(String::valueOf).toList();

        Matcher matcher = NUMBER.matcher(narrative);
        while (matcher.find()) {
            long rounded = Math.round(Double.parseDouble(matcher.group()));
            if (!allowed.contains(String.valueOf(rounded))) {
                return matcher.group();
            }
        }
        return null;
    }

    /** Whether the narrative names at least one topic it was actually given. */
    public static boolean mentionsAKnownTopic(String narrative, Grounding grounding) {
        if (grounding.allowedTopicNames().isEmpty()) {
            return true;
        }
        String normalisedNarrative = normalise(narrative);
        return grounding.allowedTopicNames().stream()
                .anyMatch(name -> normalisedNarrative.contains(normalise(name)));
    }

    private static String normalise(String value) {
        return value.trim().toLowerCase(Locale.ROOT).replaceAll("\\s+", " ");
    }
}
