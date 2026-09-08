package com.sarkaritaiyaari.backend.entity;

/**
 * The four shared-content shapes named in the architecture proposal (TASK-2301 Phase P3).
 * Mirrors {@code question_types}/{@link QuestionTypeCode}'s own "table can describe, only the
 * Java enum decides what's actually renderable" defence — {@code question_groups.group_type}
 * is a plain {@code VARCHAR}, validated against this enum at the service layer, not a DB
 * {@code CHECK} constraint, so a new group type is a code change plus a data value.
 */
public enum QuestionGroupType {
    /** A reading-comprehension passage; children ask about the same text. */
    PASSAGE,
    /** A data-interpretation table/chart; children ask about the same dataset. */
    DATA_INTERPRETATION,
    /** A shared image (diagram, photo) with no passage text of its own. */
    IMAGE,
    /** A shared map; children ask about the same map. */
    MAP
}
