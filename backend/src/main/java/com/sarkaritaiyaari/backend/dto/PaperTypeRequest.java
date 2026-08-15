package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.constraints.NotBlank;

public class PaperTypeRequest {

    @NotBlank
    private String code;

    @NotBlank
    private String label;

    /** Whether a mock test can be generated from papers of this type. */
    private boolean mockable;

    private int displayOrder;

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getLabel() {
        return label;
    }

    public void setLabel(String label) {
        this.label = label;
    }

    public boolean isMockable() {
        return mockable;
    }

    public void setMockable(boolean mockable) {
        this.mockable = mockable;
    }

    public int getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }
}
