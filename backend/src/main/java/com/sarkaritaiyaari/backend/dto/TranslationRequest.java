package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.util.List;
import java.util.Map;

public class TranslationRequest {

    @NotBlank
    private String languageCode;

    @NotBlank
    private String questionText;

    /**
     * Exactly-4-or-empty is validated in {@code QuestionService}, not here (V26, TASK-2301
     * Phase P2 Wave A) — the correct arity now depends on {@code questionType}, which lives
     * on the parent request, not on this one. TRUE_FALSE requires an empty list (its two
     * labels are fixed i18n strings, not authored text); every other type today still
     * requires exactly 4, unchanged from before Wave A.
     */
    @NotNull
    private List<String> options;

    private String explanation;

    /**
     * Per-language authored content that does not fit the flat {@code options} array —
     * Assertion & Reason's {@code {assertion, reason}}, Statement-Based's
     * {@code {statements: [...]}}. Required or forbidden depending on {@code questionType},
     * validated in {@code QuestionService} for the same reason {@code options}'s arity is.
     */
    private Map<String, Object> content;

    public String getLanguageCode() {
        return languageCode;
    }

    public void setLanguageCode(String languageCode) {
        this.languageCode = languageCode;
    }

    public String getQuestionText() {
        return questionText;
    }

    public void setQuestionText(String questionText) {
        this.questionText = questionText;
    }

    public List<String> getOptions() {
        return options;
    }

    public void setOptions(List<String> options) {
        this.options = options;
    }

    public String getExplanation() {
        return explanation;
    }

    public void setExplanation(String explanation) {
        this.explanation = explanation;
    }

    public Map<String, Object> getContent() {
        return content;
    }

    public void setContent(Map<String, Object> content) {
        this.content = content;
    }
}
