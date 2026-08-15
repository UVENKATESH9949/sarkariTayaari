package com.sarkaritaiyaari.backend.dto;

public class ExamResponse {

    private String code;
    private String name;
    private String imageUrl;
    private boolean active;
    private int displayOrder;

    public ExamResponse() {
    }

    public ExamResponse(String code, String name, String imageUrl, boolean active, int displayOrder) {
        this.code = code;
        this.name = name;
        this.imageUrl = imageUrl;
        this.active = active;
        this.displayOrder = displayOrder;
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
}
