package com.sarkaritaiyaari.backend.dto;

public class ImageUploadResponse {

    private String url;

    public ImageUploadResponse() {
    }

    public ImageUploadResponse(String url) {
        this.url = url;
    }

    public String getUrl() {
        return url;
    }

    public void setUrl(String url) {
        this.url = url;
    }
}
