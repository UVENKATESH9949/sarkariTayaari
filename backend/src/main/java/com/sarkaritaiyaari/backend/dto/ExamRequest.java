package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.constraints.NotBlank;

public class ExamRequest {

    @NotBlank
    private String code;

    @NotBlank
    private String name;

    private String imageUrl;

    private boolean active;

    private int displayOrder;

    /** Optional. Must be a difficulty_levels code when present — validated in the service. */
    private String difficulty;

    /** Optional. Must be an exam_badges code when present — validated in the service. */
    private String badge;

    public String getCode() {
        return code;
    }

    public void setCode(String code) {
        this.code = code;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getImageUrl() {
        return imageUrl;
    }

    public void setImageUrl(String imageUrl) {
        this.imageUrl = imageUrl;
    }

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }

    public int getDisplayOrder() {
        return displayOrder;
    }

    public void setDisplayOrder(int displayOrder) {
        this.displayOrder = displayOrder;
    }

    public String getDifficulty() {
        return difficulty;
    }

    public void setDifficulty(String difficulty) {
        this.difficulty = difficulty;
    }

    public String getBadge() {
        return badge;
    }

    public void setBadge(String badge) {
        this.badge = badge;
    }
}
