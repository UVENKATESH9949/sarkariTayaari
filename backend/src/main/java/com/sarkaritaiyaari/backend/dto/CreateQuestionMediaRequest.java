package com.sarkaritaiyaari.backend.dto;

import java.util.UUID;

/** Attaches an already-uploaded (via {@code POST /api/images}) file to exactly one owner. */
public class CreateQuestionMediaRequest {

    private UUID questionId;
    private UUID questionGroupId;
    private String mediaType;
    private String url;
    private String mimeType;
    private Integer displayOrder;

    public UUID getQuestionId() {
        return questionId;
    }

    public void setQuestionId(UUID questionId) {
        this.questionId = questionId;
    }

    public UUID getQuestionGroupId() {
        return questionGroupId;
    }

    public void setQuestionGroupId(UUID questionGroupId) {
        this.questionGroupId = questionGroupId;
    }

    public String getMediaType() {
        return mediaType;
    }

    public void setMediaType(String mediaType) {
        this.mediaType = mediaType;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }

    public String getMimeType() {
        return mimeType;
    }

    public void setMimeType(String mimeType) {
        this.mimeType = mimeType;
    }

    public Integer getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(Integer displayOrder) {
        this.displayOrder = displayOrder;
    }
}
