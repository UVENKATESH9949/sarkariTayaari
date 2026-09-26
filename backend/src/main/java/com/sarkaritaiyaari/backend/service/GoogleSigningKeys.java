package com.sarkaritaiyaari.backend.service;

import java.security.PublicKey;

/**
 * Google's current ID-token signing keys, by key id. An interface so tests can supply their own
 * key pair instead of calling Google.
 */
public interface GoogleSigningKeys {

    /** The public key for {@code kid}, or null when Google does not (or no longer) publish it. */
    PublicKey find(String kid);
}
