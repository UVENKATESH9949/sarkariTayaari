package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotNull;

import java.util.List;
import java.util.Map;
import java.util.UUID;

public class UpdateQuestionRequest implements PyqProvenanceCarrier {

    /**
     * No {@code questionType} field here, deliberately — a question's type is fixed at
     * creation (V25/V26, TASK-2301). {@code QuestionService.update()} reads the existing
     * entity's own type to decide how to validate/derive the answer; changing type is a
     * delete-and-recreate, matching the architecture proposal's "cross-family type change
     * requires delete and recreate" decision.
     */
    private String correctAnswer;

    /** Same rules as {@link CreateQuestionRequest#getAnswerKey()}. */
    private Map<String, Object> answerKey;

    /** Same as {@link CreateQuestionRequest#getQuestionGroupId()} — organisational, editable after creation. */
    private UUID questionGroupId;

    private Integer groupOrder;

    @NotNull
    private UUID topicId;

    @NotBlank
    private String difficulty;

    @NotEmpty(message = "at least one exam code is required")
    private List<String> examCodes;

    private boolean premium;

    /* ------------------------------------------- PYQ provenance (TICKET-2104) */

    private boolean pyq;

    /**
     * Bounded rather than left open. A four-digit sanity range turns a typo'd "202" or
     * "20223" into a readable 400 instead of a stored value that quietly skews every trend
     * computed from it.
     */
    @Min(1950)
    @Max(2100)
    private Integer pyqYear;

    @Size(max = 30)
    private String pyqShift;

    private UUID sourcePaperId;

    @Min(1)
    private Integer questionNumber;

    private String sourceUrl;

    public String getCorrectAnswer() {
        return correctAnswer;
    }

    public void setCorrectAnswer(String correctAnswer) {
        this.correctAnswer = correctAnswer;
    }

    public Map<String, Object> getAnswerKey() {
        return answerKey;
    }

    public void setAnswerKey(Map<String, Object> answerKey) {
        this.answerKey = answerKey;
    }

    public UUID getQuestionGroupId() {
        return questionGroupId;
    }

    public void setQuestionGroupId(UUID questionGroupId) {
        this.questionGroupId = questionGroupId;
    }

    public Integer getGroupOrder() {
        return groupOrder;
    }

    public void setGroupOrder(Integer groupOrder) {
        this.groupOrder = groupOrder;
    }

    public UUID getTopicId() {
        return topicId;
    }

    public void setTopicId(UUID topicId) {
        this.topicId = topicId;
    }

    public String getDifficulty() {
        return difficulty;
    }

    public void setDifficulty(String difficulty) {
        this.difficulty = difficulty;
    }

    public List<String> getExamCodes() {
        return examCodes;
    }

    public void setExamCodes(List<String> examCodes) {
        this.examCodes = examCodes;
    }

    public boolean isPremium() {
        return premium;
    }

    public void setPremium(boolean premium) {
        this.premium = premium;
    }

    @Override
    public boolean isPyq() {
        return pyq;
    }

    public void setPyq(boolean pyq) {
        this.pyq = pyq;
    }

    @Override
    public Integer getPyqYear() {
        return pyqYear;
    }

    public void setPyqYear(Integer pyqYear) {
        this.pyqYear = pyqYear;
    }

    @Override
    public String getPyqShift() {
        return pyqShift;
    }

    public void setPyqShift(String pyqShift) {
        this.pyqShift = pyqShift;
    }

    @Override
    public UUID getSourcePaperId() {
        return sourcePaperId;
    }

    public void setSourcePaperId(UUID sourcePaperId) {
        this.sourcePaperId = sourcePaperId;
    }

    @Override
    public Integer getQuestionNumber() {
        return questionNumber;
    }

    public void setQuestionNumber(Integer questionNumber) {
        this.questionNumber = questionNumber;
    }

    @Override
    public String getSourceUrl() {
        return sourceUrl;
    }

    public void setSourceUrl(String sourceUrl) {
        this.sourceUrl = sourceUrl;
    }
}
