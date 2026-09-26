package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.AuthResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Locale;

/**
 * "Continue with Google" (2026-09-25): a verified Google ID token in, a normal session out.
 *
 * <p>Same account model as the emailed code — {@link PasswordlessAccountService} finds or creates
 * the account by verified address, so the same Gmail is one account however the student signs in,
 * and the session comes from the same {@code AuthService.issueTokenFor}. The same Gmail-only rule
 * applies too: a Google Workspace address would otherwise be a way around the owner's instruction.
 */
@Service
@Transactional
public class GoogleSignInService {

    private static final Logger log = LoggerFactory.getLogger(GoogleSignInService.class);

    /** Mirrors EmailOtpService's rule, at the project owner's instruction. */
    private static final String ALLOWED_DOMAIN = "@gmail.com";

    private final GoogleIdTokenVerifier verifier;
    private final PasswordlessAccountService accounts;
    private final AuthService authService;

    public GoogleSignInService(GoogleIdTokenVerifier verifier,
                               PasswordlessAccountService accounts,
                               AuthService authService) {
        this.verifier = verifier;
        this.accounts = accounts;
        this.authService = authService;
    }

    public AuthResponse signIn(String idToken, String deviceLabel) {
        if (!verifier.isConfigured()) {
            throw new IllegalArgumentException("Google sign-in isn't available yet. Please use your email instead.");
        }
        GoogleIdTokenVerifier.GoogleIdentity identity = verifier.verify(idToken);

        String email = identity.email().trim().toLowerCase(Locale.ROOT);
        if (!email.endsWith(ALLOWED_DOMAIN)) {
            throw new IllegalArgumentException("Please use a Gmail account for now.");
        }

        PasswordlessAccountService.Result account = accounts.findOrCreate(email);
        log.info("google.signin email={} newAccount={}", OtpMailSender.maskEmail(email), account.created());
        return authService.issueTokenFor(account.user(), deviceLabel);
    }
}
