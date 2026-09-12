package com.sarkaritaiyaari.backend.ai.config;

import com.sarkaritaiyaari.backend.ai.exception.AIConfigurationException;
import org.junit.jupiter.api.Test;

import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/** Plain JUnit — pure crypto logic, no Spring, no database. */
class AiCredentialCipherTest {

    private static final String VALID_KEY = Base64.getEncoder().encodeToString(new byte[32]);

    @Test
    void encryptThenDecrypt_roundTrips() {
        AiCredentialCipher cipher = new AiCredentialCipher(VALID_KEY);

        String ciphertext = cipher.encrypt("sk-ant-super-secret");

        assertNotEquals("sk-ant-super-secret", ciphertext);
        assertEquals("sk-ant-super-secret", cipher.decrypt(ciphertext));
    }

    @Test
    void encrypt_producesDifferentCiphertextEachTime() {
        // A fresh random IV per call -- proves this isn't a deterministic/ECB-style encryption
        // that would leak whether two stored keys are identical.
        AiCredentialCipher cipher = new AiCredentialCipher(VALID_KEY);

        String first = cipher.encrypt("same-plaintext");
        String second = cipher.encrypt("same-plaintext");

        assertNotEquals(first, second);
        assertEquals("same-plaintext", cipher.decrypt(first));
        assertEquals("same-plaintext", cipher.decrypt(second));
    }

    @Test
    void blankKey_isConfiguredFalse_butDoesNotThrowAtConstruction() {
        AiCredentialCipher cipher = new AiCredentialCipher("");

        assertFalse(cipher.isConfigured());
        assertThrows(AIConfigurationException.class, () -> cipher.encrypt("anything"));
    }

    @Test
    void wrongLengthKey_failsFastAtConstruction() {
        String tooShort = Base64.getEncoder().encodeToString(new byte[16]);

        assertThrows(IllegalStateException.class, () -> new AiCredentialCipher(tooShort));
    }

    @Test
    void validKey_isConfiguredTrue() {
        assertTrue(new AiCredentialCipher(VALID_KEY).isConfigured());
    }
}
