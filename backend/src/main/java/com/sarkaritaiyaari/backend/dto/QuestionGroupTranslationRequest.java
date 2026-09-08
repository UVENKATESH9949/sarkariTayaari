package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.constraints.NotBlank;

public class QuestionGroupTranslationRequest {

    @NotBlank
    private String languageCode;

    /** Nullable — an IMAGE/MAP group may carry only a caption via question_media, no body text. */
    private String passageText;

    public String getLanguageCode() {
        return languageCode;
    }

    public void setLanguageCode(String languageCode) {
        this.languageCode = languageCode;
    }

    public String getPassageText() {
        return passageText;
    }

    public void setPassageText(String passageText) {
        this.passageText = passageText;
    }
}
