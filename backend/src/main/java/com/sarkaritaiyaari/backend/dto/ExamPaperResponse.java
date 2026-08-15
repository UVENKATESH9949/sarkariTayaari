package com.sarkaritaiyaari.backend.dto;

import java.math.BigDecimal;
import java.util.UUID;

public record ExamPaperResponse(
        UUID id,
        UUID stageId,
        String name,
        String paperType,
        boolean mockable,
        Integer durationMinutes,
        BigDecimal totalMarks,
        BigDecimal marksCorrect,
        BigDecimal marksWrong,
        boolean qualifying,
        BigDecimal qualifyingPercentage,
        int displayOrder
) {
}
