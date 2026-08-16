package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public class RegisterRequest {

    @NotBlank
    @Email(message = "must be a valid email address")
    private String email;

    /**
     * Eight characters is the floor. Deliberately no complexity rules — length matters
     * far more than forced symbols, and arbitrary rules push people toward predictable
     * passwords and password reuse.
     */
    @NotBlank
    @Size(min = 8, message = "must be at least 8 characters")
    private String password;

    private String displayName;

    /** Optional label for the device signing in, e.g. "Redmi Note 12". */
    private String deviceLabel;

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPassword() {
        return password;
    }

    public void setPassword(String password) {
        this.password = password;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getDeviceLabel() {
        return deviceLabel;
    }

    public void setDeviceLabel(String deviceLabel) {
        this.deviceLabel = deviceLabel;
    }
}
