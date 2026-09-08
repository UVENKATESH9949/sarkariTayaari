package com.sarkaritaiyaari.backend.ingestion;

/**
 * TASK-2401 Document 5/15 -- the fixed normalized taxonomy a notice's raw section
 * headings get mapped onto, config-driven per organization (see
 * {@link SectionDetector#DEFAULT_HEADING_VARIANTS}). {@link #OTHER} is not a failure --
 * an unmapped heading is kept, with its raw text preserved, never silently dropped (a
 * human reviewing an extraction can still see it).
 */
public enum SectionType {
    IMPORTANT_DATES,
    VACANCY,
    ELIGIBILITY,
    APPLICATION_FEE,
    HOW_TO_APPLY,
    SELECTION_PROCESS,
    PAY_SCALE,
    DOCUMENTS,
    OTHER,
}
