package com.sarkaritaiyaari.backend.dto;

public class UpsertQuestionGroupTranslationRequest {

    /** Nullable — an IMAGE/MAP group may carry only a caption via question_media, no body text. */
    private String passageText;

    public String getPassageText() {
        return passageText;
    }

    public void setPassageText(String passageText) {
        this.passageText = passageText;
    }
}
