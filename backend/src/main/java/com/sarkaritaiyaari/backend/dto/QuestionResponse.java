package com.sarkaritaiyaari.backend.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public class QuestionResponse {

    private UUID id;
    private String correctAnswer;
    private UUID subjectId;
    private String subjectName;
    private UUID topicId;
    private String topicName;
    private String difficulty;
    private List<String> examCodes;
    private boolean premium;
    private OffsetDateTime updatedAt;
    private boolean deleted;
    private List<TranslationResponse> translations;

    /* --------------------------------------------- PYQ provenance (TICKET-2104) */

    private boolean pyq;
    private Integer pyqYear;
    private String pyqShift;
    private UUID sourcePaperId;
    private Integer questionNumber;
    private String sourceUrl;

    /**
     * Populated only on the admin CRUD reads, and only when a pair has actually been
     * detected (TICKET-2109). Left null on the sync/public paths — a student has no use for
     * it, and it would be dead weight on every one of ~37,900 synced rows.
     */
    private List<UUID> duplicateOfQuestionIds;

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getCorrectAnswer() {
        return correctAnswer;
    }

    public void setCorrectAnswer(String correctAnswer) {
        this.correctAnswer = correctAnswer;
    }

    public UUID getSubjectId() {
        return subjectId;
    }

    public void setSubjectId(UUID subjectId) {
        this.subjectId = subjectId;
    }

    public String getSubjectName() {
        return subjectName;
    }

    public void setSubjectName(String subjectName) {
        this.subjectName = subjectName;
    }

    public UUID getTopicId() {
        return topicId;
    }

    public void setTopicId(UUID topicId) {
        this.topicId = topicId;
    }

    public String getTopicName() {
        return topicName;
    }

    public void setTopicName(String topicName) {
        this.topicName = topicName;
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

    public OffsetDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(OffsetDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }

    public boolean isDeleted() {
        return deleted;
    }

    public void setDeleted(boolean deleted) {
        this.deleted = deleted;
    }

    public List<TranslationResponse> getTranslations() {
        return translations;
    }

    public void setTranslations(List<TranslationResponse> translations) {
        this.translations = translations;
    }

    public boolean isPyq() {
        return pyq;
    }

    public void setPyq(boolean pyq) {
        this.pyq = pyq;
    }

    public Integer getPyqYear() {
        return pyqYear;
    }

    public void setPyqYear(Integer pyqYear) {
        this.pyqYear = pyqYear;
    }

    public String getPyqShift() {
        return pyqShift;
    }

    public void setPyqShift(String pyqShift) {
        this.pyqShift = pyqShift;
    }

    public UUID getSourcePaperId() {
        return sourcePaperId;
    }

    public void setSourcePaperId(UUID sourcePaperId) {
        this.sourcePaperId = sourcePaperId;
    }

    public Integer getQuestionNumber() {
        return questionNumber;
    }

    public void setQuestionNumber(Integer questionNumber) {
        this.questionNumber = questionNumber;
    }

    public String getSourceUrl() {
        return sourceUrl;
    }

    public void setSourceUrl(String sourceUrl) {
        this.sourceUrl = sourceUrl;
    }

    public List<UUID> getDuplicateOfQuestionIds() {
        return duplicateOfQuestionIds;
    }

    public void setDuplicateOfQuestionIds(List<UUID> duplicateOfQuestionIds) {
        this.duplicateOfQuestionIds = duplicateOfQuestionIds;
    }
}
