package com.sarkaritaiyaari.backend.dto;

public record DifficultyLevelResponse(
        String code,
        String label,
        int displayOrder,
        String color,
        String colorBg,
        String icon,
        boolean active
) {
}
