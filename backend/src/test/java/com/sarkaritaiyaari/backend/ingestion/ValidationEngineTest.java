package com.sarkaritaiyaari.backend.ingestion;

import com.sarkaritaiyaari.backend.entity.ExtractionTargetType;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/** TASK-2401 Task 7 -- plain JUnit, no Spring/DB. Advisory checks only: every case here
 * asserts a warning message, never a thrown exception or a rejected candidate. */
class ValidationEngineTest {

    private final ValidationEngine engine = new ValidationEngine();

    @Test
    void cycleCore_applicationStartAfterEnd_isFlagged() {
        Map<String, Object> payload = Map.of("applicationStart", "2026-07-04", "applicationEnd", "2026-06-09");

        List<String> warnings = engine.validate(ExtractionTargetType.RECRUITMENT_CYCLE_CORE, payload);

        assertThat(warnings).anyMatch(w -> w.contains("applicationStart") && w.contains("after"));
    }

    @Test
    void cycleCore_notificationDateAfterApplicationStart_isFlagged() {
        Map<String, Object> payload = Map.of("notificationDate", "2026-06-15", "applicationStart", "2026-06-09");

        List<String> warnings = engine.validate(ExtractionTargetType.RECRUITMENT_CYCLE_CORE, payload);

        assertThat(warnings).anyMatch(w -> w.contains("notificationDate") && w.contains("after"));
    }

    @Test
    void cycleCore_datesInOrder_producesNoWarnings() {
        Map<String, Object> payload = Map.of(
                "notificationDate", "2026-06-01",
                "applicationStart", "2026-06-09",
                "applicationEnd", "2026-07-04");

        List<String> warnings = engine.validate(ExtractionTargetType.RECRUITMENT_CYCLE_CORE, payload);

        assertThat(warnings).isEmpty();
    }

    @Test
    void eligibility_minimumAgeAboveMaximumAge_isFlagged() {
        Map<String, Object> payload = Map.of("minimumAge", 35, "maximumAge", 30);

        List<String> warnings = engine.validate(ExtractionTargetType.ELIGIBILITY_RULE, payload);

        assertThat(warnings).anyMatch(w -> w.contains("minimumAge") && w.contains("maximumAge"));
    }

    @Test
    void eligibility_ageInOrder_producesNoWarnings() {
        Map<String, Object> payload = Map.of("minimumAge", 18, "maximumAge", 32);

        List<String> warnings = engine.validate(ExtractionTargetType.ELIGIBILITY_RULE, payload);

        assertThat(warnings).isEmpty();
    }

    @Test
    void missingFields_neverThrowsJustSkipsTheCheck() {
        List<String> warnings = engine.validate(ExtractionTargetType.RECRUITMENT_CYCLE_CORE, Map.of("cycleName", "Fixture"));

        assertThat(warnings).isEmpty();
    }

    @Test
    void unknownTargetType_hasNoRulesYetAndIsNotAnError() {
        List<String> warnings = engine.validate(ExtractionTargetType.FEE_RULE, Map.of("amountRupees", 100));

        assertThat(warnings).isEmpty();
    }
}
