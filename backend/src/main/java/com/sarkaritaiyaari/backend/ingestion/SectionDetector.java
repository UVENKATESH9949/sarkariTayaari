package com.sarkaritaiyaari.backend.ingestion;

import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * TASK-2401 Document 5/15 -- normalizes a document's raw heading lines onto
 * {@link SectionType}'s fixed taxonomy. Config-driven: a source's own heading variants
 * (JSONB, {@code ingestion_sources.config}'s {@code sectionHeadings} key) take over from
 * {@link #DEFAULT_HEADING_VARIANTS} when supplied -- "data, not code", the same
 * philosophy {@code system-design/05} already documents for exam patterns.
 *
 * <p>Heading detection is deliberately simple and heuristic for the MVP: a line matching
 * (after stripping leading numbering/punctuation and case) one of the known variants
 * starts a new, classified section; a line that merely *looks* like a heading (short,
 * effectively all-caps) but matches no known variant still starts a new section --
 * {@link SectionType#OTHER}, with its raw text kept -- rather than being silently folded
 * into whatever section came before it.
 */
@Component
public class SectionDetector {

    public static final Map<SectionType, List<String>> DEFAULT_HEADING_VARIANTS = Map.ofEntries(
            Map.entry(SectionType.IMPORTANT_DATES, List.of("IMPORTANT DATES", "SCHEDULE OF EVENTS", "DATES TO REMEMBER")),
            Map.entry(SectionType.VACANCY, List.of("VACANCY", "VACANCIES", "NUMBER OF VACANCIES", "VACANCY DETAILS")),
            Map.entry(SectionType.ELIGIBILITY, List.of("ELIGIBILITY", "ELIGIBILITY CONDITIONS", "ELIGIBILITY CRITERIA", "EDUCATIONAL QUALIFICATION")),
            Map.entry(SectionType.APPLICATION_FEE, List.of("APPLICATION FEE", "FEE", "EXAMINATION FEE")),
            Map.entry(SectionType.HOW_TO_APPLY, List.of("HOW TO APPLY", "PROCEDURE FOR APPLYING", "MODE OF APPLICATION", "SUBMISSION OF APPLICATION")),
            Map.entry(SectionType.SELECTION_PROCESS, List.of("SCHEME OF EXAMINATION", "SELECTION PROCESS", "PATTERN OF EXAMINATION", "SCHEME OF SELECTION")),
            Map.entry(SectionType.PAY_SCALE, List.of("PAY SCALE", "PAY BAND", "SALARY", "LEVEL IN PAY MATRIX")),
            Map.entry(SectionType.DOCUMENTS, List.of("DOCUMENTS REQUIRED", "DOCUMENTS TO BE UPLOADED", "LIST OF DOCUMENTS")));

    public List<DetectedSection> detect(String fullText) {
        return detect(fullText, DEFAULT_HEADING_VARIANTS);
    }

    public List<DetectedSection> detect(String fullText, Map<SectionType, List<String>> headingVariants) {
        Map<String, SectionType> byNormalizedHeading = new HashMap<>();
        headingVariants.forEach((type, variants) -> variants.forEach(v -> byNormalizedHeading.put(normalize(v), type)));

        List<DetectedSection> sections = new ArrayList<>();
        SectionType currentType = null;
        String currentHeading = null;
        StringBuilder currentBody = new StringBuilder();

        for (String rawLine : fullText.split("\r?\n")) {
            String line = rawLine.strip();
            if (line.isEmpty()) {
                currentBody.append('\n');
                continue;
            }

            SectionType matched = byNormalizedHeading.get(normalize(line));
            boolean isHeading = matched != null || looksLikeHeading(line);

            if (isHeading) {
                if (currentHeading != null || !currentBody.toString().isBlank()) {
                    sections.add(new DetectedSection(
                            currentType != null ? currentType : SectionType.OTHER, currentHeading, currentBody.toString().strip()));
                }
                currentType = matched; // null (not yet OTHER) until we know there's no further match this section
                currentHeading = line;
                currentBody = new StringBuilder();
                if (matched == null) {
                    currentType = SectionType.OTHER;
                }
            } else {
                currentBody.append(rawLine).append('\n');
            }
        }

        if (currentHeading != null || !currentBody.toString().isBlank()) {
            sections.add(new DetectedSection(
                    currentType != null ? currentType : SectionType.OTHER, currentHeading, currentBody.toString().strip()));
        }
        return sections;
    }

    private static String normalize(String line) {
        return line.strip().toUpperCase(Locale.ROOT)
                .replaceAll("^[\\d.()\\s]+", "")
                .replaceAll("[:.]+$", "")
                .strip();
    }

    /** All-caps heuristic: short line, every letter uppercase, and either multi-word or a
     * reasonably long single word. The multi-word requirement is load-bearing, found by
     * running this against a real downloaded SSC notice (not a synthetic fixture) rather
     * than by review: PDF line-wrapping regularly puts a short all-caps abbreviation like
     * "OTR." alone on its own line mid-paragraph -- a single short ALL-CAPS token is not
     * good evidence of a real section heading the way "IMPORTANT DATES"/"VACANCY DETAILS"
     * are, and without this guard the abbreviation was misclassified as an unmapped
     * heading, incorrectly splitting one continuous paragraph in two. */
    private static boolean looksLikeHeading(String line) {
        if (line.length() < 3 || line.length() > 70) {
            return false;
        }
        String letters = line.replaceAll("[^A-Za-z]", "");
        if (letters.isEmpty() || !letters.chars().allMatch(Character::isUpperCase)) {
            return false;
        }
        boolean multiWord = line.strip().matches(".*\\s.*");
        return multiWord || letters.length() >= 8;
    }
}
