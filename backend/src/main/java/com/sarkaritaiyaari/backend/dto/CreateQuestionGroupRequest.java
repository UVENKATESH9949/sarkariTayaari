package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

public class CreateQuestionGroupRequest {

    /** One of {@code QuestionGroupType}'s values — validated in {@code QuestionGroupService}. */
    @NotBlank
    private String groupType;

    /** Optional at create time — a group can be authored empty and given its passage text afterward, like a question's translations. */
    @Size(min = 0)
    private List<@NotNull QuestionGroupTranslationRequest> translations;

    public String getGroupType() {
        return groupType;
    }

    public void setGroupType(String groupType) {
        this.groupType = groupType;
    }

    public List<QuestionGroupTranslationRequest> getTranslations() {
        return translations;
    }

    public void setTranslations(List<QuestionGroupTranslationRequest> translations) {
        this.translations = translations;
    }
}
