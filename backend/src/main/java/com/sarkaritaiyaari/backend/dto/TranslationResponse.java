package com.sarkaritaiyaari.backend.dto;

import java.util.List;

public class TranslationResponse {

    private String languageCode;
    private String questionText;
    private List<String> options;
    private String explanation;

    public TranslationResponse() {
    }

    public TranslationResponse(String languageCode, String questionText, List<String> options, String explanation) {
        this.languageCode = languageCode;
        this.questionText = questionText;
        this.options = options;
        this.explanation = explanation;
    }

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
}
