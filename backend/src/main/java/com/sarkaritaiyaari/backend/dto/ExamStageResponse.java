package com.sarkaritaiyaari.backend.dto;

import java.time.LocalDate;
import java.util.UUID;

public record ExamStageResponse(
        UUID id,
        String examCode,
        String name,
        int displayOrder,
        LocalDate effectiveFrom,
        String versionLabel
) {
}
