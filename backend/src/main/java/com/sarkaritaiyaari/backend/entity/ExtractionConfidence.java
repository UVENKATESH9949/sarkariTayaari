package com.sarkaritaiyaari.backend.entity;

/** TASK-2401 Document 21 -- a plain three-state enum, never a fabricated float ("no fake
 * precision"). Assigned by whichever layer produced the value; see
 * {@code RuleBasedExtractor}'s own doc comment for how rule-based results earn each level. */
public enum ExtractionConfidence {
    HIGH,
    MEDIUM,
    LOW,
}
