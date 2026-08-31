package com.sarkaritaiyaari.backend.dto;

import java.time.LocalDate;
import java.util.UUID;

public record ExamStageResponse(
        UUID id,
        String examCode,
        String name,
        int displayOrder,
        LocalDate effectiveFrom,
        LocalDate effectiveTo,
        String versionLabel,
        /**
         * Whether this version of the stage is the one in force today (TICKET-2108).
         *
         * <p>Resolved server-side, in one place, rather than left to each client to derive
         * from the two dates - the marks-inheritance rule in {@link ExamStructureResponse}
         * is the precedent, and the reason is the same: three clients deriving it
         * independently is three chances to disagree.
         */
        boolean active
) {
}
