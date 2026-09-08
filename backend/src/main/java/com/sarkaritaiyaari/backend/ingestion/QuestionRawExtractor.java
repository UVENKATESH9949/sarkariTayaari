package com.sarkaritaiyaari.backend.ingestion;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * TASK-2501 Phase 2, Pass 1 -- splits one page's raw extracted text into candidate question
 * blocks, the MCQ-paper equivalent of TASK-2401's {@code SectionDetector}/{@code
 * RuleBasedExtractor} (deterministic regex/keyword extraction, no AI). Everything up to the
 * next recognised question-start line belongs to the current block; within it, option lines
 * ({@code "(A)"}, {@code "B)"}, {@code "3."}, ...) are pulled out, an "Ans"-style line (when
 * it actually carries a letter/digit) is the answer, and whatever's left is the stem.
 *
 * <p>Two question-start conventions are recognised: a {@code "Q"}-prefixed number
 * ({@code "Q.1"}, {@code "Q12)"} -- unambiguous, since no option is ever labelled this way)
 * and a bare number ({@code "1."}, {@code "12)"} -- genuinely ambiguous with a NUMERIC-style
 * option line using the same 1-4 numbering, found by running this against a real SSC CGL
 * response-sheet PDF, not by review: a paper numbering its questions {@code "1."} and its
 * options {@code "1."}/{@code "2."}/{@code "3."}/{@code "4."} made every option line look
 * exactly like a new question-start line under the original single-pass, line-by-line
 * classifier, discarding almost everything. Resolved by content, not just position: a line
 * matching the option-marker syntax is only *accepted* as an option when its own text also
 * {@link #looksLikeOptionText looks like a plausible option} (short, not a question ending
 * in "?") -- a real option is essentially never a full sentence. Only once a line fails that
 * check (or the block already has all 4 options) does the same syntax get tried as a
 * question-start instead.
 *
 * <p>A block that doesn't split cleanly into a stem plus options is still returned -- never
 * silently dropped, per the architecture proposal's own "a block that doesn't yield options
 * is still recorded, just headed for low confidence" instruction. {@link
 * QuestionCandidateBuilder} is what actually assigns a confidence level; this class only
 * separates the raw text.
 */
@Component
public class QuestionRawExtractor {

    private static final Pattern QUESTION_START_PREFIXED =
            Pattern.compile("^\\s*Q[.\\s]?\\s*(\\d{1,3})[.):]?\\s*(.*)$", Pattern.CASE_INSENSITIVE);
    private static final Pattern QUESTION_START_BARE = Pattern.compile("^\\s*(\\d{1,3})[.)]\\s+(.*)$");
    private static final Pattern OPTION_LINE = Pattern.compile("^\\s*[(\\[]?([A-Da-d1-4])[).\\]]\\s+(.*)$");
    private static final Pattern ANSWER_LINE = Pattern.compile(
            "^\\s*(?:ans(?:wer)?)\\s*[:.\\-]?\\s*[(\\[]?([A-Da-d1-4])[).\\]]?\\s*$", Pattern.CASE_INSENSITIVE);

    /** A bare {@code "Ans"}/{@code "Answer"} label immediately followed by the first option
     * on the *same* line -- {@link #ANSWER_LINE} only matches a label carrying nothing but
     * the answer itself, and this is a different, real layout PDFBox produces for some
     * documents (found by running this against a real SSC CGL response-sheet PDF, not by
     * review): the stripper joins a bare "Ans" section label onto the same line as option 1
     * (e.g. {@code "Ans 1. PONSMPNO"}), which matched neither {@link #ANSWER_LINE} (trailing
     * option text fails its end anchor) nor {@link #OPTION_LINE} (the line doesn't start with
     * the marker) -- silently losing option 1 into the stem instead. The label is stripped
     * before any other check runs, so the remainder is processed exactly as if "Ans" had
     * never been there.
     */
    private static final Pattern ANS_LABEL_PREFIX = Pattern.compile(
            "^\\s*(?:ans(?:wer)?)\\s+(?=[(\\[]?[A-Da-d1-4][).\\]])", Pattern.CASE_INSENSITIVE);

    /** A real MCQ option is essentially never a full sentence -- this is what tells a real
     * option apart from a question stem that merely happens to start with the same
     * {@code "N."}/{@code "N)"} marker syntax a numbered option also uses. */
    private static final int MAX_PLAUSIBLE_OPTION_LENGTH = 80;

    private static boolean looksLikeOptionText(String text) {
        return text.length() <= MAX_PLAUSIBLE_OPTION_LENGTH && !text.endsWith("?");
    }

    public record RawQuestionBlock(String questionText, List<String> options, String answerText) {
    }

    private static final class Block {
        final List<String> stemLines = new ArrayList<>();
        final List<String> options = new ArrayList<>();
        String answerText;

        RawQuestionBlock build() {
            return new RawQuestionBlock(String.join(" ", stemLines).strip(), List.copyOf(options), answerText);
        }
    }

    public List<RawQuestionBlock> split(String pageText) {
        List<RawQuestionBlock> blocks = new ArrayList<>();
        if (pageText == null || pageText.isBlank()) {
            return blocks;
        }

        Block current = null;
        for (String rawLine : pageText.split("\\r?\\n")) {
            Matcher ansPrefix = ANS_LABEL_PREFIX.matcher(rawLine);
            String line = ansPrefix.lookingAt() ? rawLine.substring(ansPrefix.end()) : rawLine;

            Matcher answer = ANSWER_LINE.matcher(line);
            if (current != null && answer.matches()) {
                current.answerText = answer.group(1).toUpperCase(Locale.ROOT);
                continue;
            }

            Matcher option = OPTION_LINE.matcher(line);
            if (current != null && current.options.size() < 4 && option.matches()
                    && looksLikeOptionText(option.group(2).strip())) {
                current.options.add(option.group(2).strip());
                continue;
            }

            Matcher prefixedStart = QUESTION_START_PREFIXED.matcher(line);
            boolean isPrefixedStart = prefixedStart.matches();
            Matcher bareStart = isPrefixedStart ? null : QUESTION_START_BARE.matcher(line);
            boolean isBareStart = !isPrefixedStart && bareStart.matches();

            if (isPrefixedStart || isBareStart) {
                if (current != null) {
                    blocks.add(current.build());
                }
                current = new Block();
                String firstLine = isPrefixedStart ? prefixedStart.group(2) : bareStart.group(2);
                if (!firstLine.isBlank()) {
                    current.stemLines.add(firstLine.strip());
                }
                continue;
            }

            // A line before the first recognised question-start (a header, page number, a
            // "Chosen Option" row, etc.) belongs to no block and is dropped -- there is
            // nothing yet to attach it to.
            if (current != null && !line.isBlank()) {
                current.stemLines.add(line.strip());
            }
        }
        if (current != null) {
            blocks.add(current.build());
        }
        return blocks;
    }
}
