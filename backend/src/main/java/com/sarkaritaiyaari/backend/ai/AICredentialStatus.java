package com.sarkaritaiyaari.backend.ai;

/** Result of a "does this API key actually work" check (§8's future admin "Test connection"
 * action). Deliberately not a boolean return — {@code message} carries the reason a real
 * operator would need to see, without ever including the key itself. */
public record AICredentialStatus(boolean valid, String message) {
    public static AICredentialStatus ok() {
        return new AICredentialStatus(true, "Credentials are valid");
    }

    public static AICredentialStatus invalid(String message) {
        return new AICredentialStatus(false, message);
    }
}
