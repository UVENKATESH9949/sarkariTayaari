package com.sarkaritaiyaari.backend.dto;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public class QuestionGroupResponse {

    private UUID id;
    private String groupType;
    private OffsetDateTime updatedAt;
    private boolean deleted;
    private List<QuestionGroupTranslationResponse> translations;
    private List<QuestionMediaResponse> media;

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getGroupType() {
        return groupType;
    }

    public void setGroupType(String groupType) {
        this.groupType = groupType;
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

    public List<QuestionGroupTranslationResponse> getTranslations() {
        return translations;
    }

    public void setTranslations(List<QuestionGroupTranslationResponse> translations) {
        this.translations = translations;
    }

    public List<QuestionMediaResponse> getMedia() {
        return media;
    }

    public void setMedia(List<QuestionMediaResponse> media) {
        this.media = media;
    }
}
