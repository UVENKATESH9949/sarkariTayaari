package com.sarkaritaiyaari.backend.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Wire shapes for passwordless sign-in (see {@code api/AUTH.md}, migration V51).
 */
public final class EmailOtpDtos {

    private EmailOtpDtos() {
    }

    public static class RequestCodeRequest {

        @NotBlank(message = "Email is required")
        @Email(message = "That does not look like an email address")
        private String email;

        public String getEmail() {
            return email;
        }

        public void setEmail(String email) {
            this.email = email;
        }
    }

    public static class VerifyCodeRequest {

        @NotBlank(message = "Email is required")
        @Email(message = "That does not look like an email address")
        private String email;

        /**
         * Exactly six digits. Validated here as well as compared in the service so a malformed
         * value is rejected before it can burn one of the five attempts on the live code.
         */
        @NotBlank(message = "Code is required")
        @Pattern(regexp = "\\d{6}", message = "The code is 6 digits")
        private String code;

        /** Optional, shown on the account screen so a student can tell their devices apart. */
        @Size(max = 100)
        private String deviceLabel;

        public String getEmail() {
            return email;
        }

        public void setEmail(String email) {
            this.email = email;
        }

        public String getCode() {
            return code;
        }

        public void setCode(String code) {
            this.code = code;
        }

        public String getDeviceLabel() {
            return deviceLabel;
        }

        public void setDeviceLabel(String deviceLabel) {
            this.deviceLabel = deviceLabel;
        }
    }

    /**
     * Deliberately says nothing about whether the address has an account — see
     * {@code EmailOtpService.requestCode}.
     *
     * @param emailed false when the server has no mail account configured and wrote the code to
     *                its log instead. Reported so a developer can tell the two apart; a real
     *                deployment always reports true
     * @param code    present only in a deployment that explicitly opted into exposing it, which
     *                is never a real one
     */
    public record RequestCodeResponse(String message, int expiresInMinutes, boolean emailed, String code) {
    }
}
