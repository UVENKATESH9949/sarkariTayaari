package com.sarkaritaiyaari.backend.service;

/** Authenticated, but the account's role doesn't permit this action. Mapped to 403. */
public class ForbiddenException extends RuntimeException {
    public ForbiddenException(String message) {
        super(message);
    }
}
