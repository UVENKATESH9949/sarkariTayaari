package com.sarkaritaiyaari.backend.dto;

public class LanguageResponse {

    private String code;
    private String name;
    private boolean active;

    public LanguageResponse() {
    }

    public LanguageResponse(String code, String name, boolean active) {
        this.code = code;
        this.name = name;
        this.active = active;
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

    public boolean isActive() {
        return active;
    }

    public void setActive(boolean active) {
        this.active = active;
    }
}
