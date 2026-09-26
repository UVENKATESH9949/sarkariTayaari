package com.sarkaritaiyaari.backend.config;

import com.sarkaritaiyaari.backend.ai.exception.AIAuthenticationException;
import com.sarkaritaiyaari.backend.ai.exception.AIConfigurationException;
import com.sarkaritaiyaari.backend.ai.exception.AIException;
import com.sarkaritaiyaari.backend.ai.exception.AIInvalidRequestException;
import com.sarkaritaiyaari.backend.ai.exception.AIModelNotFoundException;
import com.sarkaritaiyaari.backend.ai.exception.AIProviderUnavailableException;
import com.sarkaritaiyaari.backend.ai.exception.AIRateLimitException;
import com.sarkaritaiyaari.backend.ai.exception.AITimeoutException;
import com.sarkaritaiyaari.backend.ai.exception.AIUnknownProviderException;
import com.sarkaritaiyaari.backend.service.ForbiddenException;
import com.sarkaritaiyaari.backend.service.EmailDeliveryException;
import com.sarkaritaiyaari.backend.service.UnauthorizedException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.orm.ObjectOptimisticLockingFailureException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;
import java.util.NoSuchElementException;
import java.util.stream.Collectors;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(NoSuchElementException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(NoSuchElementException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(MissingServletRequestParameterException.class)
    public ResponseEntity<Map<String, String>> handleMissingParam(MissingServletRequestParameterException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", "Missing required parameter: " + ex.getParameterName()));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleBadRequest(IllegalArgumentException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", ex.getMessage()));
    }

    /** The sign-in email could not be sent; retrying shortly is the right advice, so 503. */
    @ExceptionHandler(EmailDeliveryException.class)
    public ResponseEntity<Map<String, String>> handleEmailDelivery(EmailDeliveryException ex) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(UnauthorizedException.class)
    public ResponseEntity<Map<String, String>> handleUnauthorized(UnauthorizedException ex) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", ex.getMessage()));
    }

    @ExceptionHandler(ForbiddenException.class)
    public ResponseEntity<Map<String, String>> handleForbidden(ForbiddenException ex) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN).body(Map.of("error", ex.getMessage()));
    }

    /**
     * A missing Authorization header is the caller not being signed in, not a malformed
     * request — 401 tells the app to prompt for sign-in, where 400 would look like a bug.
     */
    @ExceptionHandler(MissingRequestHeaderException.class)
    public ResponseEntity<Map<String, String>> handleMissingHeader(MissingRequestHeaderException ex) {
        if ("Authorization".equalsIgnoreCase(ex.getHeaderName())) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(Map.of("error", "Not signed in"));
        }
        return ResponseEntity.badRequest().body(Map.of("error", "Missing required header: " + ex.getHeaderName()));
    }

    /** An admin's PUT carried a stale {@code expectedVersion} — someone else changed this
     * configuration since they last read it (AI Admin Control Center, §30). */
    @ExceptionHandler(ObjectOptimisticLockingFailureException.class)
    public ResponseEntity<Map<String, String>> handleOptimisticLock(ObjectOptimisticLockingFailureException ex) {
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "This configuration was changed by someone else — please reload and try again."));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(err -> err.getField() + ": " + err.getDefaultMessage())
                .collect(Collectors.joining("; "));
        return ResponseEntity.badRequest().body(Map.of("error", message));
    }

    /**
     * Normalizes every {@code ai.exception.AIException} subtype to an HTTP status, in one
     * place, so a future feature controller that calls {@code AIService} gets correct status
     * codes for free rather than needing its own mapping. Nothing throws these yet (no
     * controller calls {@code AIService} in this phase) — this exists so the first feature
     * that does doesn't also have to touch this file.
     */
    @ExceptionHandler(AIException.class)
    public ResponseEntity<Map<String, String>> handleAiException(AIException ex) {
        HttpStatus status = switch (ex) {
            case AIRateLimitException e -> HttpStatus.TOO_MANY_REQUESTS;
            case AITimeoutException e -> HttpStatus.GATEWAY_TIMEOUT;
            case AIAuthenticationException e -> HttpStatus.BAD_GATEWAY;
            case AIProviderUnavailableException e -> HttpStatus.SERVICE_UNAVAILABLE;
            case AIConfigurationException e -> HttpStatus.SERVICE_UNAVAILABLE;
            case AIUnknownProviderException e -> HttpStatus.SERVICE_UNAVAILABLE;
            case AIInvalidRequestException e -> HttpStatus.BAD_REQUEST;
            case AIModelNotFoundException e -> HttpStatus.BAD_REQUEST;
            default -> HttpStatus.INTERNAL_SERVER_ERROR;
        };
        return ResponseEntity.status(status).body(Map.of("error", ex.getMessage()));
    }
}
