package com.sarkaritaiyaari.backend.entity;

/** TASK-2401 Document 6/9 -- which existing Exam Guide table a candidate proposes a row
 * for. Deliberately the same enum vocabulary as the existing *Request DTOs it mirrors. */
public enum ExtractionTargetType {
    RECRUITMENT_CYCLE_CORE,
    ELIGIBILITY_RULE,
    IMPORTANT_DATE,
    DOCUMENT_REQUIREMENT,
    APPLICATION_STEP,
    APPLICATION_MISTAKE,
    FEE_RULE,
}
