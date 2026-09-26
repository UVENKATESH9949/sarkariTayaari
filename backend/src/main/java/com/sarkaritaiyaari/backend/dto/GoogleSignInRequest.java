package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * {@code POST /api/auth/google} — the ID token the Google Sign-In SDK returned on the device.
 * The server verifies it itself (GoogleIdTokenVerifier); nothing else in the body is trusted.
 */
public class GoogleSignInRequest {

    @NotBlank(message = "idToken is required")
    @Size(max = 8192)
    private String idToken;

    @Size(max = 100)
    private String deviceLabel;

    public String getIdToken() { return idToken; }

    public void setIdToken(String idToken) { this.idToken = idToken; }

    public String getDeviceLabel() { return deviceLabel; }

    public void setDeviceLabel(String deviceLabel) { this.deviceLabel = deviceLabel; }
}
