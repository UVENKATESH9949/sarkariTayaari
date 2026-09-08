package com.sarkaritaiyaari.backend.ingestion;

import com.sarkaritaiyaari.backend.entity.ExtractionConfidence;
import com.sarkaritaiyaari.backend.entity.ExtractionTargetType;

import java.util.Map;

/**
 * One prospective fact-row {@link RuleBasedExtractor} produced -- one row per fact, not
 * per field, matching {@code ingestion_extraction_results}' own granularity (Document 9).
 * {@code payload} keys match the existing {@code *Request} DTO field names for
 * {@code targetType} 1:1, so applying it later (a later task) is a mechanical
 * deserialize-and-call, not a translation step.
 */
public record ExtractedCandidate(
        ExtractionTargetType targetType,
        Map<String, Object> payload,
        ExtractionConfidence confidence,
        String sourceExcerpt) {
}
