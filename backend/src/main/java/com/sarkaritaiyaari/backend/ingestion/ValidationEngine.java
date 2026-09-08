package com.sarkaritaiyaari.backend.ingestion;

import com.sarkaritaiyaari.backend.entity.ExtractionTargetType;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * TASK-2401 Document 8/22 -- deterministic checks run over a candidate's own payload
 * before it reaches review. Advisory, not blocking (Document 8's own wording): a
 * genuinely unusual real notification should still be reviewable, just flagged, so a
 * violation is recorded as a warning on the same candidate row, never a rejection.
 *
 * <p>Two of Document 8's originally-sketched rules ({@code correction_start <=
 * correction_end}, {@code sum(vacancy by category) ~= vacancy_count}) have nothing to
 * check yet -- Task 6's {@code RuleBasedExtractor} extracts a single total
 * {@code vacancyCount} with no per-category breakdown, and no corrigendum-specific date
 * pair. Not faked to have something to validate; simply not triggered until a future
 * task extracts those fields, same as any other rule here when its inputs are absent.
 */
@Component
public class ValidationEngine {

    public List<String> validate(ExtractionTargetType targetType, Map<String, Object> payload) {
        List<String> warnings = new ArrayList<>();
        switch (targetType) {
            case RECRUITMENT_CYCLE_CORE -> validateCycleCore(payload, warnings);
            case ELIGIBILITY_RULE -> validateEligibility(payload, warnings);
            default -> {
                // No rule defined for this target type yet.
            }
        }
        return warnings;
    }

    private void validateCycleCore(Map<String, Object> payload, List<String> warnings) {
        LocalDate notificationDate = dateOf(payload, "notificationDate");
        LocalDate applicationStart = dateOf(payload, "applicationStart");
        LocalDate applicationEnd = dateOf(payload, "applicationEnd");

        if (applicationStart != null && applicationEnd != null && applicationStart.isAfter(applicationEnd)) {
            warnings.add("applicationStart (" + applicationStart + ") is after applicationEnd (" + applicationEnd + ")");
        }
        if (notificationDate != null && applicationStart != null && notificationDate.isAfter(applicationStart)) {
            warnings.add("notificationDate (" + notificationDate + ") is after applicationStart (" + applicationStart + ")");
        }
    }

    private void validateEligibility(Map<String, Object> payload, List<String> warnings) {
        Integer minimumAge = intOf(payload, "minimumAge");
        Integer maximumAge = intOf(payload, "maximumAge");
        if (minimumAge != null && maximumAge != null && minimumAge > maximumAge) {
            warnings.add("minimumAge (" + minimumAge + ") is greater than maximumAge (" + maximumAge + ")");
        }
    }

    private static LocalDate dateOf(Map<String, Object> payload, String key) {
        Object value = payload.get(key);
        if (value == null) {
            return null;
        }
        try {
            return LocalDate.parse(value.toString());
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static Integer intOf(Map<String, Object> payload, String key) {
        Object value = payload.get(key);
        return value instanceof Number number ? number.intValue() : null;
    }
}
