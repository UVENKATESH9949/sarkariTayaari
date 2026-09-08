package com.sarkaritaiyaari.backend.ingestion;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** TASK-2401 Task 5 -- plain JUnit, no Spring/DB (pure text-in, sections-out logic). */
class SectionDetectorTest {

    private final SectionDetector detector = new SectionDetector();

    @Test
    void detect_classifiesKnownHeadingsAndKeepsBodyText() {
        String text = """
                Some preamble text before any heading appears.

                IMPORTANT DATES
                Application start: 09-06-2026
                Application end: 04-07-2026

                VACANCY
                Total vacancies: 14582
                """;

        List<DetectedSection> sections = detector.detect(text);

        assertThat(sections).hasSize(3);
        assertThat(sections.get(0).type()).isEqualTo(SectionType.OTHER);
        assertThat(sections.get(0).rawHeading()).isNull();
        assertThat(sections.get(0).bodyText()).contains("preamble");

        assertThat(sections.get(1).type()).isEqualTo(SectionType.IMPORTANT_DATES);
        assertThat(sections.get(1).rawHeading()).isEqualTo("IMPORTANT DATES");
        assertThat(sections.get(1).bodyText()).contains("Application start").contains("Application end");

        assertThat(sections.get(2).type()).isEqualTo(SectionType.VACANCY);
        assertThat(sections.get(2).bodyText()).contains("14582");
    }

    @Test
    void detect_unmappedHeading_keptAsOtherWithRawTextPreserved() {
        String text = """
                ELIGIBILITY
                Age 18-32 years.

                SOME UNUSUAL HEADING NOT IN THE TAXONOMY
                A paragraph under a heading this detector has never heard of.
                """;

        List<DetectedSection> sections = detector.detect(text);

        assertThat(sections).hasSize(2);
        assertThat(sections.get(0).type()).isEqualTo(SectionType.ELIGIBILITY);
        assertThat(sections.get(1).type()).isEqualTo(SectionType.OTHER);
        assertThat(sections.get(1).rawHeading()).isEqualTo("SOME UNUSUAL HEADING NOT IN THE TAXONOMY");
        assertThat(sections.get(1).bodyText()).contains("never heard of");
    }

    @Test
    void detect_headingWithLeadingNumberingAndTrailingColon_stillMatches() {
        String text = """
                3. Application Fee:
                Rs. 100/- for General category.
                """;

        List<DetectedSection> sections = detector.detect(text);

        assertThat(sections).hasSize(1);
        assertThat(sections.get(0).type()).isEqualTo(SectionType.APPLICATION_FEE);
    }

    @Test
    void detect_customHeadingVariants_overrideDefaults() {
        String text = """
                CUSTOM FEE HEADING
                Rs. 100/-
                """;

        List<DetectedSection> sections = detector.detect(text, Map.of(SectionType.APPLICATION_FEE, List.of("CUSTOM FEE HEADING")));

        assertThat(sections).hasSize(1);
        assertThat(sections.get(0).type()).isEqualTo(SectionType.APPLICATION_FEE);
    }

    @Test
    void detect_noHeadingsAtAll_isOneOtherSection() {
        String text = "Just a plain paragraph of body text with no heading anywhere in it.";

        List<DetectedSection> sections = detector.detect(text);

        assertThat(sections).hasSize(1);
        assertThat(sections.get(0).type()).isEqualTo(SectionType.OTHER);
        assertThat(sections.get(0).rawHeading()).isNull();
    }
}
