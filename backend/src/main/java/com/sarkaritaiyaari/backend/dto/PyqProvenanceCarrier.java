package com.sarkaritaiyaari.backend.dto;

import java.util.UUID;

/**
 * The PYQ provenance fields shared by every question-write request (TICKET-2104).
 *
 * <p>An interface rather than a nested object or three independent copies. Create, update
 * and bulk-import all need the same five fields, and the JSON has to stay flat — the admin
 * console and every existing import file post flat question objects, and nesting them under
 * a {@code "pyq": {...}} key would be a breaking change to a documented import format for
 * purely internal tidiness.
 *
 * <p>What this buys is that the <em>logic</em> lives in one place
 * ({@code QuestionService.applyPyqProvenance}) instead of being copied three times. Only the
 * field declarations repeat, and those are what the wire format demands.
 */
public interface PyqProvenanceCarrier {

    boolean isPyq();

    Integer getPyqYear();

    String getPyqShift();

    UUID getSourcePaperId();

    Integer getQuestionNumber();

    String getSourceUrl();
}
