package com.sarkaritaiyaari.backend.service;

/**
 * The sign-in email could not be sent. Mapped to 503 by GlobalExceptionHandler.
 *
 * <p>Thrown for every address alike, so it says nothing about whether an account exists — the
 * property {@link EmailOtpService#requestCode} is built around. Before this existed, a failed send
 * was logged and swallowed, and the app told the student "we've emailed you a code" for an email
 * that never left the server.
 */
public class EmailDeliveryException extends RuntimeException {
    public EmailDeliveryException(String message) {
        super(message);
    }
}
