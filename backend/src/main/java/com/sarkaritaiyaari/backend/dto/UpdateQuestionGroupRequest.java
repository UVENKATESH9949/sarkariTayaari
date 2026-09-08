package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.constraints.NotBlank;

public class UpdateQuestionGroupRequest {

    @NotBlank
    private String groupType;

    public String getGroupType() {
        return groupType;
    }

    public void setGroupType(String groupType) {
        this.groupType = groupType;
    }
}
