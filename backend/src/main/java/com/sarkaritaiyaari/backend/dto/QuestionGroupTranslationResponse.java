package com.sarkaritaiyaari.backend.dto;

public class QuestionGroupTranslationResponse {

    private final String languageCode;
    private final String passageText;

    public QuestionGroupTranslationResponse(String languageCode, String passageText) {
        this.languageCode = languageCode;
        this.passageText = passageText;
    }

    public String getLanguageCode() {
        return languageCode;
    }

    public String getPassageText() {
        return passageText;
    }
}
