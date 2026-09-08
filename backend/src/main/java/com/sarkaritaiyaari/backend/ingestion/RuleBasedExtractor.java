package com.sarkaritaiyaari.backend.ingestion;

import com.sarkaritaiyaari.backend.entity.ExtractionConfidence;
import com.sarkaritaiyaari.backend.entity.ExtractionTargetType;
import com.sarkaritaiyaari.backend.entity.IngestionNotice;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * TASK-2401 Document 6 -- deterministic regex/keyword extraction over
 * {@link SectionDetector}'s output, for the brief's own minimal field set (name,
 * notification date, application start/end, vacancies, age limit, qualification, fee,
 * selection process, official link). Layer 3 (AI) does not exist yet in this pipeline
 * (Task 6 is rule-based only) -- a field this class can't confidently extract is simply
 * absent from the payload, not guessed at.
 *
 * <h2>Confidence (Document 21)</h2>
 * {@code name}/{@code notificationDate} come from the source's own structured listing
 * metadata ({@link IngestionNotice#getTitle()}/{@link IngestionNotice#getPublishedAt()}),
 * not a text guess -- {@code HIGH}. Every other field is a regex match over free text,
 * inherently ambiguous (which date near which keyword, which URL among several) --
 * {@code MEDIUM} at best. {@code qualification}/{@code selectionProcess} are raw section
 * body text, not a parsed value -- {@code LOW}, and capped in length. A candidate row's
 * overall confidence (Document 9's "one row per fact, not per field") is the weakest
 * among its populated fields' individual confidence, never averaged or invented.
 */
@Component
public class RuleBasedExtractor {

    private static final Pattern DATE_PATTERN = Pattern.compile("(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{4})");
    private static final Pattern VACANCY_PATTERN =
            Pattern.compile("(?i)total\\s+(?:no\\.?\\s+of\\s+)?vacanc\\w*\\D{0,25}?([\\d,]{2,7})");
    private static final Pattern AGE_PATTERN = Pattern.compile("(\\d{1,2})\\s*(?:to|-|–)\\s*(\\d{1,2})\\s*years");
    private static final Pattern FEE_PATTERN = Pattern.compile("(?i)Rs\\.?\\s*([\\d,]{2,6})\\s*/?-?");
    private static final Pattern URL_PATTERN = Pattern.compile("https?://[\\w./?=&%-]+");

    private static final int FREE_TEXT_FIELD_CAP = 500;

    public List<ExtractedCandidate> extract(IngestionNotice notice, List<DetectedSection> sections) {
        List<ExtractedCandidate> candidates = new ArrayList<>();

        cycleCoreCandidate(notice, sections).ifPresent(candidates::add);
        eligibilityCandidate(sections).ifPresent(candidates::add);
        feeCandidate(sections).ifPresent(candidates::add);
        selectionProcessCandidate(sections).ifPresent(candidates::add);

        return candidates;
    }

    private Optional<ExtractedCandidate> cycleCoreCandidate(IngestionNotice notice, List<DetectedSection> sections) {
        Map<String, Object> payload = new HashMap<>();
        List<ExtractionConfidence> confidences = new ArrayList<>();
        List<String> excerpts = new ArrayList<>();

        if (notice.getTitle() != null && !notice.getTitle().isBlank()) {
            payload.put("cycleName", notice.getTitle());
            confidences.add(ExtractionConfidence.HIGH);
        }
        if (notice.getPublishedAt() != null) {
            payload.put("notificationDate", notice.getPublishedAt().atZoneSameInstant(ZoneOffset.UTC).toLocalDate().toString());
            confidences.add(ExtractionConfidence.HIGH);
        }

        String importantDates = bodyOf(sections, SectionType.IMPORTANT_DATES);
        extractDateNear(importantDates, "start", "commence", "opening", "from").ifPresent(date -> {
            payload.put("applicationStart", date.toString());
            confidences.add(ExtractionConfidence.MEDIUM);
            excerpts.add("applicationStart~" + date);
        });
        extractDateNear(importantDates, "last date", "closing", "end", "till").ifPresent(date -> {
            payload.put("applicationEnd", date.toString());
            confidences.add(ExtractionConfidence.MEDIUM);
            excerpts.add("applicationEnd~" + date);
        });

        String vacancyText = bodyOf(sections, SectionType.VACANCY);
        Matcher vacancyMatcher = VACANCY_PATTERN.matcher(vacancyText);
        if (vacancyMatcher.find()) {
            try {
                int count = Integer.parseInt(vacancyMatcher.group(1).replace(",", ""));
                payload.put("vacancyCount", count);
                confidences.add(ExtractionConfidence.MEDIUM);
                excerpts.add(trimSnippet(vacancyMatcher.group(), 80));
            } catch (NumberFormatException ignored) {
                // Malformed number -- skip this field rather than guess.
            }
        }

        if (notice.getNoticeUrl() != null && !notice.getNoticeUrl().isBlank()) {
            payload.put("notificationUrl", notice.getNoticeUrl());
            confidences.add(ExtractionConfidence.HIGH);
        } else {
            Matcher urlMatcher = URL_PATTERN.matcher(fullBody(sections));
            if (urlMatcher.find()) {
                payload.put("notificationUrl", urlMatcher.group());
                confidences.add(ExtractionConfidence.MEDIUM);
            }
        }

        if (payload.isEmpty()) {
            return Optional.empty();
        }
        return Optional.of(new ExtractedCandidate(
                ExtractionTargetType.RECRUITMENT_CYCLE_CORE, payload, weakest(confidences), String.join("; ", excerpts)));
    }

    private Optional<ExtractedCandidate> eligibilityCandidate(List<DetectedSection> sections) {
        String text = bodyOf(sections, SectionType.ELIGIBILITY);
        if (text.isBlank()) {
            return Optional.empty();
        }

        Map<String, Object> payload = new HashMap<>();
        List<ExtractionConfidence> confidences = new ArrayList<>();

        Matcher ageMatcher = AGE_PATTERN.matcher(text);
        if (ageMatcher.find()) {
            payload.put("minimumAge", Integer.parseInt(ageMatcher.group(1)));
            payload.put("maximumAge", Integer.parseInt(ageMatcher.group(2)));
            confidences.add(ExtractionConfidence.MEDIUM);
        }

        payload.put("qualification", trimSnippet(text, FREE_TEXT_FIELD_CAP));
        confidences.add(ExtractionConfidence.LOW);

        return Optional.of(new ExtractedCandidate(
                ExtractionTargetType.ELIGIBILITY_RULE, payload, weakest(confidences), trimSnippet(text, 200)));
    }

    private Optional<ExtractedCandidate> feeCandidate(List<DetectedSection> sections) {
        String text = bodyOf(sections, SectionType.APPLICATION_FEE);
        if (text.isBlank()) {
            return Optional.empty();
        }

        Matcher feeMatcher = FEE_PATTERN.matcher(text);
        if (!feeMatcher.find()) {
            return Optional.empty();
        }
        try {
            int amount = Integer.parseInt(feeMatcher.group(1).replace(",", ""));
            Map<String, Object> payload = new HashMap<>();
            payload.put("category", "General");
            payload.put("amountRupees", amount);
            payload.put("exempted", false);
            return Optional.of(new ExtractedCandidate(
                    ExtractionTargetType.FEE_RULE, payload, ExtractionConfidence.MEDIUM, trimSnippet(feeMatcher.group(), 80)));
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }

    private Optional<ExtractedCandidate> selectionProcessCandidate(List<DetectedSection> sections) {
        String text = bodyOf(sections, SectionType.SELECTION_PROCESS);
        if (text.isBlank()) {
            return Optional.empty();
        }
        Map<String, Object> payload = new HashMap<>();
        payload.put("stepNumber", 1);
        payload.put("title", "Selection Process");
        payload.put("description", trimSnippet(text, FREE_TEXT_FIELD_CAP));
        return Optional.of(new ExtractedCandidate(
                ExtractionTargetType.APPLICATION_STEP, payload, ExtractionConfidence.LOW, trimSnippet(text, 200)));
    }

    private static String bodyOf(List<DetectedSection> sections, SectionType type) {
        return sections.stream()
                .filter(s -> s.type() == type)
                .map(DetectedSection::bodyText)
                .reduce((a, b) -> a + "\n" + b)
                .orElse("");
    }

    private static String fullBody(List<DetectedSection> sections) {
        return sections.stream().map(DetectedSection::bodyText).reduce((a, b) -> a + "\n" + b).orElse("");
    }

    private static Optional<LocalDate> extractDateNear(String text, String... keywords) {
        for (String line : text.split("\r?\n")) {
            String lower = line.toLowerCase(Locale.ROOT);
            for (String keyword : keywords) {
                if (lower.contains(keyword)) {
                    Optional<LocalDate> date = firstDateIn(line);
                    if (date.isPresent()) {
                        return date;
                    }
                }
            }
        }
        return Optional.empty();
    }

    private static Optional<LocalDate> firstDateIn(String text) {
        Matcher matcher = DATE_PATTERN.matcher(text);
        if (!matcher.find()) {
            return Optional.empty();
        }
        try {
            int day = Integer.parseInt(matcher.group(1));
            int month = Integer.parseInt(matcher.group(2));
            int year = Integer.parseInt(matcher.group(3));
            return Optional.of(LocalDate.of(year, month, day));
        } catch (NumberFormatException | java.time.DateTimeException e) {
            return Optional.empty();
        }
    }

    private static ExtractionConfidence weakest(List<ExtractionConfidence> confidences) {
        if (confidences.contains(ExtractionConfidence.LOW)) {
            return ExtractionConfidence.LOW;
        }
        if (confidences.contains(ExtractionConfidence.MEDIUM)) {
            return ExtractionConfidence.MEDIUM;
        }
        return ExtractionConfidence.HIGH;
    }

    private static String trimSnippet(String text, int maxLength) {
        String cleaned = text.strip().replaceAll("\\s+", " ");
        return cleaned.length() <= maxLength ? cleaned : cleaned.substring(0, maxLength) + "...";
    }
}
