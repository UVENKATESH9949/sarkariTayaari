package com.sarkaritaiyaari.backend.dto;

public class ExamResponse {

    private String code;
    private String name;
    private String imageUrl;
    private boolean active;
    private int displayOrder;
    /** difficulty_levels code, or null. Clients join it against their own synced copy of
     * that table for the label/colour/icon rather than having them duplicated here. */
    private String difficulty;
    /** exam_badges code, or null. Same join-rather-than-denormalise reasoning. */
    private String badge;
    /** Discovery-filter facet (SSC/Banking/Railways/...), or null if uncategorized. */
    private String category;

    public ExamResponse() {
    }

    public ExamResponse(String code, String name, String imageUrl, boolean active, int displayOrder,
                        String difficulty, String badge, String category) {
        this.code = code;
        this.name = name;
        this.imageUrl = imageUrl;
        this.active = active;
        this.displayOrder = displayOrder;
        this.difficulty = difficulty;
        this.badge = badge;
        this.category = category;
    }

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

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }
}
