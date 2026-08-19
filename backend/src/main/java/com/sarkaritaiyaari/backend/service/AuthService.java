package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.AuthResponse;
import com.sarkaritaiyaari.backend.dto.LoginRequest;
import com.sarkaritaiyaari.backend.dto.RegisterRequest;
import com.sarkaritaiyaari.backend.entity.Role;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.entity.UserToken;
import com.sarkaritaiyaari.backend.repository.UserRepository;
import com.sarkaritaiyaari.backend.repository.UserTokenRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.Locale;

@Service
@Transactional
public class AuthService {

    /**
     * A hash of a throwaway value, compared against when no user matches so that a
     * failed login costs the same time whether or not the email exists. Without it,
     * response timing quietly tells an attacker which addresses are registered.
     */
    private static final String DUMMY_HASH =
            "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

    private final UserRepository userRepository;
    private final UserTokenRepository tokenRepository;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private final SecureRandom random = new SecureRandom();
    private final int tokenTtlDays;

    public AuthService(UserRepository userRepository,
                       UserTokenRepository tokenRepository,
                       @Value("${app.auth.token-ttl-days:365}") int tokenTtlDays) {
        this.userRepository = userRepository;
        this.tokenRepository = tokenRepository;
        this.tokenTtlDays = tokenTtlDays;
    }

    public AuthResponse register(RegisterRequest request) {
        User user = createUser(request, Role.STUDENT);
        return issueToken(user, request.getDeviceLabel());
    }

    /**
     * Creates another admin account. Only reachable by an existing admin
     * (see {@link com.sarkaritaiyaari.backend.controller.AuthController}), so this
     * deliberately does not issue a token — the new admin signs themselves in via the
     * normal {@link #login} flow rather than the creator ever holding their credential.
     */
    public AuthResponse.UserResponse registerAdmin(RegisterRequest request) {
        User user = createUser(request, Role.ADMIN);
        return describe(user);
    }

    private User createUser(RegisterRequest request, Role role) {
        String email = normalise(request.getEmail());

        if (userRepository.existsByEmail(email)) {
            // Deliberately explicit. This does let someone probe which emails are
            // registered, but the alternative — a vague error — leaves a real user
            // stuck with no idea why they cannot sign up.
            throw new IllegalArgumentException("An account already exists for " + email);
        }

        User user = new User();
        user.setEmail(email);
        user.setPasswordHash(passwordEncoder.encode(request.getPassword()));
        user.setDisplayName(trimToNull(request.getDisplayName()));
        user.setRole(role);
        userRepository.save(user);
        return user;
    }

    public AuthResponse login(LoginRequest request) {
        String email = normalise(request.getEmail());
        User user = userRepository.findByEmail(email).orElse(null);

        // Always run a hash comparison, even with no user, so both paths cost the same.
        String hash = user != null ? user.getPasswordHash() : DUMMY_HASH;
        boolean matches = passwordEncoder.matches(request.getPassword(), hash);

        if (user == null || !matches) {
            // One message for both cases: saying which half was wrong hands an attacker
            // a free way to enumerate accounts.
            throw new UnauthorizedException("Email or password is incorrect");
        }

        // Cheap housekeeping while we already have the user in hand.
        tokenRepository.deleteExpired(OffsetDateTime.now());

        return issueToken(user, request.getDeviceLabel());
    }

    public void logout(String authorizationHeader) {
        String token = extractToken(authorizationHeader);
        tokenRepository.deleteById(token);
    }

    /** Signs the user out everywhere — used when a device is lost. */
    public void logoutAllDevices(User user) {
        tokenRepository.deleteByUserId(user.getId());
    }

    /**
     * Resolves the caller from an `Authorization: Bearer <token>` header.
     *
     * Called explicitly by the endpoints that need a user rather than enforced by a
     * servlet filter: the existing content and sync endpoints are deliberately public,
     * and a global filter would be an easy way to break them by accident.
     */
    @Transactional(readOnly = true)
    public User requireUser(String authorizationHeader) {
        String token = extractToken(authorizationHeader);
        UserToken stored = tokenRepository.findByTokenWithUser(token)
                .orElseThrow(() -> new UnauthorizedException("Not signed in"));

        if (stored.isExpired()) {
            throw new UnauthorizedException("Session expired — please sign in again");
        }
        return stored.getUser();
    }

    /** Same as {@link #requireUser}, plus a role check. Used by admin-only endpoints. */
    @Transactional(readOnly = true)
    public User requireAdmin(String authorizationHeader) {
        User user = requireUser(authorizationHeader);
        if (user.getRole() != Role.ADMIN) {
            throw new ForbiddenException("Admin access required");
        }
        return user;
    }

    @Transactional(readOnly = true)
    public AuthResponse.UserResponse describe(User user) {
        return new AuthResponse.UserResponse(user.getId(), user.getEmail(), user.getDisplayName(), user.getRole().name());
    }

    /* ------------------------------------------------------------------- internals */

    private AuthResponse issueToken(User user, String deviceLabel) {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);

        UserToken token = new UserToken();
        token.setToken(Base64.getUrlEncoder().withoutPadding().encodeToString(bytes));
        token.setUser(user);
        token.setExpiresAt(OffsetDateTime.now().plusDays(tokenTtlDays));
        token.setDeviceLabel(trimToNull(deviceLabel));
        tokenRepository.save(token);

        return new AuthResponse(token.getToken(), token.getExpiresAt(), describe(user));
    }

    private static String extractToken(String header) {
        if (header == null || !header.startsWith("Bearer ")) {
            throw new UnauthorizedException("Not signed in");
        }
        String token = header.substring("Bearer ".length()).trim();
        if (token.isEmpty()) {
            throw new UnauthorizedException("Not signed in");
        }
        return token;
    }

    private static String normalise(String email) {
        return email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }

    private static String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
