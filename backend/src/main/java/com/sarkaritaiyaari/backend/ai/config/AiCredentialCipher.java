package com.sarkaritaiyaari.backend.ai.config;

import com.sarkaritaiyaari.backend.ai.exception.AIConfigurationException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

/**
 * Encrypts a provider API key at rest — AES-256-GCM via the JDK's own {@code javax.crypto},
 * no new Maven dependency. The encryption key comes from {@code app.ai.encryption-key} /
 * {@code AI_ENCRYPTION_KEY} (base64, 32 bytes) and is <b>never</b> stored in the database —
 * a compromised database alone can never decrypt a stored key without also having this
 * server-side secret.
 *
 * A blank key at startup is tolerated (matches every other Phase 1 config value's "not
 * configured yet" posture — most environments never store a provider key in Postgres at
 * all). A <em>present but wrong-length</em> key fails fast at construction — a real
 * misconfiguration, not an absent one, and better caught at boot than on the first save.
 */
@Component
public class AiCredentialCipher {

    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int GCM_TAG_LENGTH_BITS = 128;
    private static final int IV_LENGTH_BYTES = 12;
    private static final int KEY_LENGTH_BYTES = 32;

    private final SecretKeySpec key;
    private final SecureRandom random = new SecureRandom();

    public AiCredentialCipher(@Value("${app.ai.encryption-key:}") String base64Key) {
        if (base64Key == null || base64Key.isBlank()) {
            this.key = null;
            return;
        }
        byte[] raw = Base64.getDecoder().decode(base64Key);
        if (raw.length != KEY_LENGTH_BYTES) {
            throw new IllegalStateException(
                    "app.ai.encryption-key must decode to exactly " + KEY_LENGTH_BYTES + " bytes (AES-256), got " + raw.length);
        }
        this.key = new SecretKeySpec(raw, "AES");
    }

    public boolean isConfigured() {
        return key != null;
    }

    public String encrypt(String plaintext) {
        requireKey();
        try {
            byte[] iv = new byte[IV_LENGTH_BYTES];
            random.nextBytes(iv);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv));
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
            ByteBuffer combined = ByteBuffer.allocate(iv.length + ciphertext.length);
            combined.put(iv).put(ciphertext);
            return Base64.getEncoder().encodeToString(combined.array());
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Failed to encrypt an AI provider credential", e);
        }
    }

    public String decrypt(String encoded) {
        requireKey();
        try {
            byte[] combined = Base64.getDecoder().decode(encoded);
            byte[] iv = Arrays.copyOfRange(combined, 0, IV_LENGTH_BYTES);
            byte[] ciphertext = Arrays.copyOfRange(combined, IV_LENGTH_BYTES, combined.length);
            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(GCM_TAG_LENGTH_BITS, iv));
            return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException("Failed to decrypt an AI provider credential — check app.ai.encryption-key", e);
        }
    }

    private void requireKey() {
        if (key == null) {
            throw new AIConfigurationException(
                    "No AI encryption key configured (app.ai.encryption-key / AI_ENCRYPTION_KEY) — cannot store or read an API key");
        }
    }
}
