package com.sarkaritaiyaari.backend.dto;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Returned by register and login. The token goes in an `Authorization: Bearer <token>`
 * header on subsequent requests.
 *
 * The password hash is never exposed here, and there is no endpoint anywhere that
 * returns it.
 */
public record AuthResponse(
        String token,
        OffsetDateTime expiresAt,
        UserResponse user
) {
    public record UserResponse(
            UUID id,
            String email,
            String displayName
    ) {
    }
}
