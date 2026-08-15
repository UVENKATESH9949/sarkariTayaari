package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public class PaperSectionRequest {

    @NotNull
    private UUID paperId;

    @NotBlank
    private String name;

    private int questionCount;

    /** null = shares the paper's overall time; set = separately timed. */
    private Integer durationMinutes;

    /** null = inherit the paper's marking. */
    private BigDecimal marksCorrect;

    private BigDecimal marksWrong;

    private int displayOrder;

    /** A section must draw from at least one subject or no questions can be selected for it. */
    @NotEmpty(message = "at least one subject is required")
    private List<UUID> subjectIds;

    public UUID getPaperId() {
        return paperId;
    }

    public void setPaperId(UUID paperId) {
        this.paperId = paperId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public int getQuestionCount() {
        return questionCount;
    }

    public void setQuestionCount(int questionCount) {
        this.questionCount = questionCount;
    }

    public Integer getDurationMinutes() {
        return durationMinutes;
    }

    public void setDurationMinutes(Integer durationMinutes) {
        this.durationMinutes = durationMinutes;
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

    public int getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }

    public List<UUID> getSubjectIds() {
        return subjectIds;
    }

    public void setSubjectIds(List<UUID> subjectIds) {
        this.subjectIds = subjectIds;
    }
}
