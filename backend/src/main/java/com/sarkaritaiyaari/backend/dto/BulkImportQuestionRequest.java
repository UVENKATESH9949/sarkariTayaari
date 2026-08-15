package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

/**
 * Bulk import references Subject/Topic by name (auto-created if new) and exam codes
 * by code (must already exist) — unlike {@link CreateQuestionRequest}, which takes a
 * resolved topicId. Whoever is preparing an import file shouldn't need to know internal
 * IDs or pre-register a new sub-topic before it can be used.
 */
public class BulkImportQuestionRequest {

    @NotBlank
    private String correctAnswer;

    @NotBlank
    private String subjectName;

    @NotBlank
    private String topicName;

    @NotBlank
    private String difficulty;

    @NotEmpty(message = "at least one exam code is required")
    private List<String> examCodes;

    private boolean premium;

    @NotEmpty(message = "at least one translation (the 'en' root language) is required")
    @Valid
    private List<TranslationRequest> translations;

    public String getCorrectAnswer() {
        return correctAnswer;
    }

    public void setCorrectAnswer(String correctAnswer) {
        this.correctAnswer = correctAnswer;
    }

    public String getSubjectName() {
        return subjectName;
    }

    public void setSubjectName(String subjectName) {
        this.subjectName = subjectName;
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

    public List<TranslationRequest> getTranslations() {
        return translations;
    }

    public void setTranslations(List<TranslationRequest> translations) {
        this.translations = translations;
    }
}
