package com.sarkaritaiyaari.backend.dto;

public record ExamBadgeResponse(
        String code,
        String label,
        int displayOrder,
        String color,
        String colorBg,
        boolean active
) {
}
