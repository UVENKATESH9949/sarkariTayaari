package com.sarkaritaiyaari.backend.dto;

public record PaperTypeResponse(
        String code,
        String label,
        boolean mockable,
        int displayOrder
) {
}
