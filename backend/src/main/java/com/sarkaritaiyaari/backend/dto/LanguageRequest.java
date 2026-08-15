package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.constraints.NotBlank;

public class LanguageRequest {

    @NotBlank
    private String code;

    @NotBlank
    private String name;

    private boolean active;

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
