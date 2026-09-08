package com.sarkaritaiyaari.backend.ingestion;

import com.sarkaritaiyaari.backend.entity.ExtractionConfidence;
import com.sarkaritaiyaari.backend.entity.ExtractionTargetType;
import com.sarkaritaiyaari.backend.entity.IngestionNotice;
import org.junit.jupiter.api.Test;

import java.time.OffsetDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/** TASK-2401 Task 6 -- plain JUnit, no Spring/DB (pure text-in, candidates-out logic). */
class RuleBasedExtractorTest {

    private final RuleBasedExtractor extractor = new RuleBasedExtractor();
    private final SectionDetector sectionDetector = new SectionDetector();

    private static IngestionNotice notice(String title, String noticeUrl, OffsetDateTime publishedAt) {
        IngestionNotice notice = new IngestionNotice();
        notice.setTitle(title);
        notice.setNoticeUrl(noticeUrl);
        notice.setPublishedAt(publishedAt);
        return notice;
    }

    @Test
    void extract_recruitmentCycleCore_pullsNameDateAndVacancy() {
        IngestionNotice notice = notice("SSC CGL 2027 Notification", "https://ssc.gov.in/notice", OffsetDateTime.parse("2026-06-01T00:00:00Z"));
        String text = """
                IMPORTANT DATES
                Commencement of Online Application: 09-06-2026
                Last date for submission of online application: 04-07-2026

                VACANCY
                Total No. of Vacancies : 14582
                """;
        List<DetectedSection> sections = sectionDetector.detect(text);

        List<ExtractedCandidate> candidates = extractor.extract(notice, sections);

        ExtractedCandidate cycleCore = candidates.stream()
                .filter(c -> c.targetType() == ExtractionTargetType.RECRUITMENT_CYCLE_CORE)
                .findFirst().orElseThrow();

        assertThat(cycleCore.payload()).containsEntry("cycleName", "SSC CGL 2027 Notification");
        assertThat(cycleCore.payload()).containsEntry("applicationStart", "2026-06-09");
        assertThat(cycleCore.payload()).containsEntry("applicationEnd", "2026-07-04");
        assertThat(cycleCore.payload()).containsEntry("vacancyCount", 14582);
        assertThat(cycleCore.payload()).containsEntry("notificationUrl", "https://ssc.gov.in/notice");
        // Weakest of {HIGH (name/url), MEDIUM (dates/vacancy)} -- MEDIUM.
        assertThat(cycleCore.confidence()).isEqualTo(ExtractionConfidence.MEDIUM);
    }

    @Test
    void extract_eligibility_pullsAgeRangeAndKeepsQualificationText() {
        IngestionNotice notice = notice("Fixture Notice", null, null);
        String text = """
                ELIGIBILITY
                Age Limit: 18 to 32 years as on the closing date.
                Educational Qualification: Bachelor's Degree from a recognized university.
                """;
        List<DetectedSection> sections = sectionDetector.detect(text);

        List<ExtractedCandidate> candidates = extractor.extract(notice, sections);

        ExtractedCandidate eligibility = candidates.stream()
                .filter(c -> c.targetType() == ExtractionTargetType.ELIGIBILITY_RULE)
                .findFirst().orElseThrow();

        assertThat(eligibility.payload()).containsEntry("minimumAge", 18);
        assertThat(eligibility.payload()).containsEntry("maximumAge", 32);
        assertThat((String) eligibility.payload().get("qualification")).contains("Bachelor's Degree");
        // Free-text qualification capture is always LOW, dragging the row confidence down.
        assertThat(eligibility.confidence()).isEqualTo(ExtractionConfidence.LOW);
    }

    @Test
    void extract_fee_pullsAmount() {
        IngestionNotice notice = notice("Fixture Notice", null, null);
        String text = """
                APPLICATION FEE
                Candidates are required to pay Rs. 100/- as application fee.
                """;
        List<DetectedSection> sections = sectionDetector.detect(text);

        List<ExtractedCandidate> candidates = extractor.extract(notice, sections);

        ExtractedCandidate fee = candidates.stream()
                .filter(c -> c.targetType() == ExtractionTargetType.FEE_RULE)
                .findFirst().orElseThrow();

        assertThat(fee.payload()).containsEntry("amountRupees", 100);
        assertThat(fee.confidence()).isEqualTo(ExtractionConfidence.MEDIUM);
    }

    @Test
    void extract_selectionProcess_capturesRawSectionText() {
        IngestionNotice notice = notice("Fixture Notice", null, null);
        String text = """
                SCHEME OF EXAMINATION
                The examination will be conducted in two tiers: Tier-I (objective) and Tier-II (descriptive).
                """;
        List<DetectedSection> sections = sectionDetector.detect(text);

        List<ExtractedCandidate> candidates = extractor.extract(notice, sections);

        ExtractedCandidate step = candidates.stream()
                .filter(c -> c.targetType() == ExtractionTargetType.APPLICATION_STEP)
                .findFirst().orElseThrow();

        assertThat(step.payload()).containsEntry("stepNumber", 1);
        assertThat((String) step.payload().get("description")).contains("Tier-I");
        assertThat(step.confidence()).isEqualTo(ExtractionConfidence.LOW);
    }

    @Test
    void extract_noRecognizableContent_producesNoCandidates() {
        IngestionNotice notice = notice(null, null, null);
        List<DetectedSection> sections = sectionDetector.detect("Just a plain paragraph with nothing structured in it.");

        List<ExtractedCandidate> candidates = extractor.extract(notice, sections);

        assertThat(candidates).isEmpty();
    }

    @Test
    void extract_feeSectionWithNoAmount_producesNoFeeCandidateRatherThanGuessing() {
        IngestionNotice notice = notice("Fixture Notice", null, null);
        String text = """
                APPLICATION FEE
                Fee details will be notified separately.
                """;
        List<DetectedSection> sections = sectionDetector.detect(text);

        List<ExtractedCandidate> candidates = extractor.extract(notice, sections);

        assertThat(candidates).noneMatch(c -> c.targetType() == ExtractionTargetType.FEE_RULE);
    }
}
