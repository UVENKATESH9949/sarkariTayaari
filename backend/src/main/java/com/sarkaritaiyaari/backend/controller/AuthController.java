package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.dto.AuthResponse;
import com.sarkaritaiyaari.backend.dto.LoginRequest;
import com.sarkaritaiyaari.backend.dto.RegisterRequest;
import com.sarkaritaiyaari.backend.service.AuthService;
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

    public AuthController(AuthService authService) {
        this.authService = authService;
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
}
