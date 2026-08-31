package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.constraints.NotBlank;

import java.time.LocalDate;

public class ExamStageRequest {

    @NotBlank
    private String examCode;

    @NotBlank
    private String name;

    private int displayOrder;

    private LocalDate effectiveFrom;

    /**
     * Closes the effectivity window (TICKET-2108). Null = still current.
     *
     * <p>Not validated against {@code effectiveFrom} by an annotation, because a
     * field-level constraint cannot see a sibling field. The ordering is checked in
     * {@code ExamStructureService.applyStage} and again by a DB CHECK in V16.
     */
    private LocalDate effectiveTo;

    private String versionLabel;

    public String getExamCode() {
        return examCode;
    }

    public void setExamCode(String examCode) {
        this.examCode = examCode;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public int getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }

    public LocalDate getEffectiveFrom() {
        return effectiveFrom;
    }

    public void setEffectiveFrom(LocalDate effectiveFrom) {
        this.effectiveFrom = effectiveFrom;
    }

    public String getVersionLabel() {
        return versionLabel;
    }

    public void setVersionLabel(String versionLabel) {
        this.versionLabel = versionLabel;
    }

    public LocalDate getEffectiveTo() {
        return effectiveTo;
    }

    public void setEffectiveTo(LocalDate effectiveTo) {
        this.effectiveTo = effectiveTo;
    }
}
