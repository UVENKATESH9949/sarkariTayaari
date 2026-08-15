package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.UUID;

public class ExamPaperRequest {

    @NotNull
    private UUID stageId;

    @NotBlank
    private String name;

    @NotBlank
    private String paperType;

    private Integer durationMinutes;

    private BigDecimal totalMarks;

    private BigDecimal marksCorrect;

    private BigDecimal marksWrong;

    private boolean qualifying;

    private BigDecimal qualifyingPercentage;

    private int displayOrder;

    public UUID getStageId() {
        return stageId;
    }

    public void setStageId(UUID stageId) {
        this.stageId = stageId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getPaperType() {
        return paperType;
    }

    public void setPaperType(String paperType) {
        this.paperType = paperType;
    }

    public Integer getDurationMinutes() {
        return durationMinutes;
    }

    public void setDurationMinutes(Integer durationMinutes) {
        this.durationMinutes = durationMinutes;
    }

    public BigDecimal getTotalMarks() {
        return totalMarks;
    }

    public void setTotalMarks(BigDecimal totalMarks) {
        this.totalMarks = totalMarks;
    }

    public BigDecimal getMarksCorrect() {
        return marksCorrect;
    }

    public void setMarksCorrect(BigDecimal marksCorrect) {
        this.marksCorrect = marksCorrect;
    }

    public BigDecimal getMarksWrong() {
        return marksWrong;
    }

    public void setMarksWrong(BigDecimal marksWrong) {
        this.marksWrong = marksWrong;
    }

    public boolean isQualifying() {
        return qualifying;
    }

    public void setQualifying(boolean qualifying) {
        this.qualifying = qualifying;
    }

    public BigDecimal getQualifyingPercentage() {
        return qualifyingPercentage;
    }

    public void setQualifyingPercentage(BigDecimal qualifyingPercentage) {
        this.qualifyingPercentage = qualifyingPercentage;
    }

    public int getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }
}
