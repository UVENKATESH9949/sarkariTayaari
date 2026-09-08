package com.sarkaritaiyaari.backend.ingestion;

/**
 * One section of a document's text, after {@link SectionDetector} has run.
 * {@code rawHeading} is null for the implicit leading section (any text before the first
 * detected heading) and non-null otherwise -- kept even when {@code type} is
 * {@link SectionType#OTHER}, so a reviewer can see exactly what heading text wasn't
 * recognized.
 */
public record DetectedSection(SectionType type, String rawHeading, String bodyText) {
}
