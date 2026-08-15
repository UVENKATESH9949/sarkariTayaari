package com.sarkaritaiyaari.backend.dto;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record PaperSectionResponse(
        UUID id,
        UUID paperId,
        String name,
        int questionCount,
        Integer durationMinutes,
        BigDecimal marksCorrect,
        BigDecimal marksWrong,
        int displayOrder,
        List<SubjectRef> subjects
) {
    public record SubjectRef(UUID id, String name) {
    }
}
