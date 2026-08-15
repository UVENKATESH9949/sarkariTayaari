package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.util.List;
import java.util.UUID;

public class CreateQuestionRequest {

    @NotBlank
    private String correctAnswer;

    @NotNull
    private UUID topicId;

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

    public List<TranslationRequest> getTranslations() {
        return translations;
    }

    public void setTranslations(List<TranslationRequest> translations) {
        this.translations = translations;
    }
}
