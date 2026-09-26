package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.AuthResponse;
import com.sarkaritaiyaari.backend.dto.EmailOtpDtos;
import com.sarkaritaiyaari.backend.dto.GoogleSignInRequest;
import com.sarkaritaiyaari.backend.dto.LoginRequest;
import com.sarkaritaiyaari.backend.dto.RegisterRequest;
import com.sarkaritaiyaari.backend.service.AuthService;
import com.sarkaritaiyaari.backend.service.EmailOtpService;
import com.sarkaritaiyaari.backend.service.GoogleSignInService;
import jakarta.validation.Valid;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;
    private final EmailOtpService emailOtpService;
    private final GoogleSignInService googleSignInService;

    public AuthController(AuthService authService, EmailOtpService emailOtpService,
                          GoogleSignInService googleSignInService) {
        this.authService = authService;
        this.emailOtpService = emailOtpService;
        this.googleSignInService = googleSignInService;
    }

    /**
     * Sends a one-time sign-in code to a Gmail address (V51).
     *
     * <p><b>Answers identically whether or not the address has an account.</b> Saying otherwise
     * would turn this into a membership oracle for any address someone cares to try — the same
     * reasoning behind {@code login}'s single error message.
     *
     * <p>There is no separate "register": a verified code for an unknown address creates the
     * account. Password sign-in below is untouched and still serves the admin console.
     */
    @PostMapping("/otp/request")
    public EmailOtpDtos.RequestCodeResponse requestCode(
            @Valid @RequestBody EmailOtpDtos.RequestCodeRequest request) {
        EmailOtpService.RequestResult result = emailOtpService.requestCode(request.getEmail());
        return new EmailOtpDtos.RequestCodeResponse(
                "If that address can be used, a 6-digit code is on its way.",
                result.expiresInMinutes(), result.emailed(), result.code());
    }

    /** Redeems a code and returns a session, creating the account on first use. */
    @PostMapping("/otp/verify")
    public AuthResponse verifyCode(@Valid @RequestBody EmailOtpDtos.VerifyCodeRequest request) {
        return emailOtpService.verifyCode(request.getEmail(), request.getCode(), request.getDeviceLabel());
    }

    /**
     * "Continue with Google" (2026-09-25). Verifies the Google ID token server-side and returns the
     * same session shape as every other sign-in. Same Gmail -> same account as an emailed code.
     * 401 for any token that fails verification; 400 for a non-Gmail account or when Google
     * sign-in is not configured on this server.
     */
    @PostMapping("/google")
    public AuthResponse google(@Valid @RequestBody GoogleSignInRequest request) {
        return googleSignInService.signIn(request.getIdToken(), request.getDeviceLabel());
    }

    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(authService.register(request));
    }

    @PostMapping("/login")
    public AuthResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request);
    }

    /** Revokes just this device's token; other devices stay signed in. */
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        authService.logout(authorization);
        return ResponseEntity.noContent().build();
    }

    /** Lets the app check whether a stored token is still good on launch. */
    @GetMapping("/me")
    public AuthResponse.UserResponse me(@RequestHeader(HttpHeaders.AUTHORIZATION) String authorization) {
        return authService.describe(authService.requireUser(authorization));
    }

    /**
     * Creates another admin account. Only an existing admin can call this — the very
     * first admin is created by {@code AdminBootstrapRunner} on startup instead, since
     * nobody has a token yet at that point.
     */
    @PostMapping("/admin/register")
    public ResponseEntity<AuthResponse.UserResponse> registerAdmin(
            @RequestHeader(HttpHeaders.AUTHORIZATION) String authorization,
            @Valid @RequestBody RegisterRequest request) {
        authService.requireAdmin(authorization);
        return ResponseEntity.status(HttpStatus.CREATED).body(authService.registerAdmin(request));
    }
}
