package com.sarkaritaiyaari.backend.service;

/** Bad credentials, or a missing/invalid/expired token. Mapped to 401. */
public class UnauthorizedException extends RuntimeException {

    public UnauthorizedException(String message) {
        super(message);
    }
}
