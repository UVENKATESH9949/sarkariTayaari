package com.sarkaritaiyaari.backend.dto;

public record QuestionTypeResponse(
        String code,
        String label,
        String evaluatorFamily,
        boolean authoringEnabled,
        boolean defaultNegativeMarking,
        int displayOrder
) {
}
