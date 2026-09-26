package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.dto.AuthResponse;
import com.sarkaritaiyaari.backend.entity.EmailOtpCode;
import com.sarkaritaiyaari.backend.repository.EmailOtpCodeRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

/**
 * Sign-in and sign-up with a one-time code emailed to the student (migration V51).
 *
 * <h2>One flow, not two</h2>
 * There is no separate "register" step. The address either has an account or it does not, and the
 * server knows which — asking the student to pick is asking them to answer a question the system
 * can answer itself, and gets it wrong the moment somebody forgets whether they signed up.
 * A verified code for an unknown address creates the account; for a known one it signs in.
 *
 * <h2>What keeps a six-digit code safe</h2>
 * Six digits is a million possibilities, which is nothing to a script. The safety comes entirely
 * from the three limits below, so they are constants with names rather than magic numbers:
 * a short expiry, a hard cap on wrong guesses, and a cooldown between sends. Remove any one and
 * the code is guessable.
 *
 * <h2>Requesting a code never says whether the account exists</h2>
 * {@link #requestCode} behaves identically for a known and an unknown address. Anything else turns
 * the endpoint into a membership oracle for any address someone cares to try — the same reasoning
 * behind {@code AuthService.login}'s single "email or password is incorrect" message and its dummy
 * hash comparison.
 *
 * <p><b>Existing password sign-in is untouched.</b> The admin console signs in with a password and
 * must keep working; this is an additional way in, not a replacement.
 */
@Service
@Transactional
public class EmailOtpService {

    private static final Logger log = LoggerFactory.getLogger(EmailOtpService.class);

    /** Short enough to limit guessing, long enough to survive a slow inbox. */
    static final int CODE_TTL_MINUTES = 10;

    /** Wrong guesses before the code is dead and a new one must be requested. */
    static final int MAX_ATTEMPTS = 5;

    /** Minimum gap between sends to one address, so the endpoint cannot be used to spam an inbox. */
    static final int RESEND_COOLDOWN_SECONDS = 60;

    /**
     * Most codes one address can be sent per rolling hour (2026-09-24). The cooldown alone still
     * allowed sixty emails an hour to one inbox — a spam vector — and, at five guesses per code, far
     * more guesses per hour than any real student needs. Five an hour covers every honest retry.
     */
    static final int MAX_CODES_PER_HOUR = 5;

    /**
     * Only Gmail addresses, for now, at the project owner's explicit instruction. Enforced in one
     * place so widening it later is a one-line change rather than a hunt.
     */
    private static final String ALLOWED_DOMAIN = "@gmail.com";

    private final EmailOtpCodeRepository codeRepository;
    private final PasswordlessAccountService accounts;
    private final AuthService authService;
    private final OtpMailSender mailSender;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    private final SecureRandom random = new SecureRandom();
    private final boolean returnCodeInResponse;

    public EmailOtpService(EmailOtpCodeRepository codeRepository,
                           PasswordlessAccountService accounts,
                           AuthService authService,
                           OtpMailSender mailSender,
                           @Value("${app.mail.expose-code-in-response:false}") boolean returnCodeInResponse) {
        this.codeRepository = codeRepository;
        this.accounts = accounts;
        this.authService = authService;
        this.mailSender = mailSender;
        this.returnCodeInResponse = returnCodeInResponse;
    }

    /**
     * Issues a code and emails it. Answers the same way whatever the address, by design.
     *
     * @return the code itself ONLY when {@code app.mail.expose-code-in-response} is on — a
     *         developer convenience for driving the flow without an inbox, default false, and
     *         never to be enabled anywhere real.
     */
    public RequestResult requestCode(String rawEmail) {
        String email = normalise(rawEmail);
        requireAllowedAddress(email);

        OffsetDateTime now = OffsetDateTime.now();

        /*
         * Cooldown, checked against the newest code rather than a counter: a student who taps
         * "resend" twice should be told to wait, not silently given a second code that invalidates
         * the one already in their inbox.
         */
        Optional<EmailOtpCode> newest = codeRepository.findNewestForEmail(email);
        if (newest.isPresent()
                && newest.get().getCreatedAt().plusSeconds(RESEND_COOLDOWN_SECONDS).isAfter(now)) {
            long wait = RESEND_COOLDOWN_SECONDS
                    - java.time.Duration.between(newest.get().getCreatedAt(), now).toSeconds();
            throw new IllegalArgumentException(
                    "A code was just sent. Please wait " + Math.max(1, wait) + " seconds before asking for another.");
        }

        long sentThisHour = codeRepository.countIssuedSince(email, now.minusHours(1));
        if (sentThisHour >= MAX_CODES_PER_HOUR) {
            throw new IllegalArgumentException(
                    "Too many codes requested for this email. Please try again in about an hour.");
        }

        // Retire anything still live, so exactly one code per address can ever be redeemed.
        List<EmailOtpCode> live = codeRepository.findLiveForEmail(email, now);
        for (EmailOtpCode stale : live) {
            stale.setConsumedAt(now);
        }

        String code = generateCode();
        EmailOtpCode row = new EmailOtpCode();
        row.setEmail(email);
        row.setCodeHash(encoder.encode(code));
        row.setExpiresAt(now.plusMinutes(CODE_TTL_MINUTES));
        codeRepository.save(row);

        /*
         * Throws EmailDeliveryException when mail is on and the send failed. This method is
         * transactional, so that also rolls back the new row AND the retirement above: the student's
         * previous code (if any) stays usable, and the failed attempt does not start a cooldown.
         */
        mailSender.sendCode(email, code, CODE_TTL_MINUTES);

        // Opportunistic cleanup while we are already writing. Bounded and cheap; nothing depends on
        // it having run, so a failure here would be harmless.
        codeRepository.deleteExpiredBefore(now.minusDays(1));

        return new RequestResult(CODE_TTL_MINUTES, mailSender.isDelivering(),
                returnCodeInResponse ? code : null);
    }

    /**
     * Redeems a code, creating the account if this address has never signed in before.
     *
     * <p>Every failure is the same message. Distinguishing "wrong code" from "expired" from "too
     * many tries" would tell an attacker which addresses have a live code outstanding.
     */
    /*
     * noRollbackFor is load-bearing, not tidiness. THE ATTEMPT COUNTER IS THE ONLY THING MAKING A
     * SIX-DIGIT CODE SAFE, and a wrong guess reports failure by throwing UnauthorizedException —
     * a RuntimeException, which Spring rolls back on by default. That rollback undid the very
     * increment that was supposed to record the guess, so attempt_count never left 0 and the code
     * could be brute-forced without limit.
     *
     * Found by running it, not by reading it: five wrong guesses followed by the correct one still
     * signed in. An earlier version of this comment asserted the opposite — that the handler
     * mapping the exception to a 401 meant no rollback — which is simply false. What the exception
     * is later mapped to has nothing to do with whether the transaction commits.
     */
    @Transactional(noRollbackFor = UnauthorizedException.class)
    public AuthResponse verifyCode(String rawEmail, String rawCode, String deviceLabel) {
        String email = normalise(rawEmail);
        requireAllowedAddress(email);

        String code = rawCode == null ? "" : rawCode.trim();
        OffsetDateTime now = OffsetDateTime.now();

        EmailOtpCode row = codeRepository.findNewestForEmail(email)
                .filter(c -> c.isRedeemable(now, MAX_ATTEMPTS))
                .orElseThrow(() -> new UnauthorizedException(
                        "That code is not valid. Ask for a new one and try again."));

        /*
         * Recorded BEFORE the comparison, so a caller cannot buy a free guess by killing the
         * connection mid-request. It survives the failure path only because of the
         * noRollbackFor on this method — see the note there; without it this line is a no-op
         * and the cap does nothing at all.
         */
        row.setAttemptCount(row.getAttemptCount() + 1);
        codeRepository.saveAndFlush(row);

        if (!encoder.matches(code, row.getCodeHash())) {
            throw new UnauthorizedException("That code is not valid. Ask for a new one and try again.");
        }

        row.setConsumedAt(now);

        // Shared with Google sign-in, so the same address is always the same account.
        PasswordlessAccountService.Result account = accounts.findOrCreate(email);
        log.info("otp.verified email={} newAccount={}", OtpMailSender.maskEmail(email), account.created());

        return authService.issueTokenFor(account.user(), deviceLabel);
    }

    /* ------------------------------------------------------------------- internals */

    /** Six digits, uniformly distributed, from a cryptographic source. */
    private String generateCode() {
        return String.format("%06d", random.nextInt(1_000_000));
    }

    private static void requireAllowedAddress(String email) {
        if (email == null || email.isBlank() || !email.endsWith(ALLOWED_DOMAIN)) {
            throw new IllegalArgumentException("Please use a Gmail address for now.");
        }
        // Cheap shape check; the domain suffix above already does most of the work.
        int at = email.indexOf('@');
        if (at <= 0) {
            throw new IllegalArgumentException("Please use a Gmail address for now.");
        }
    }

    private static String normalise(String email) {
        return email == null ? null : email.trim().toLowerCase(Locale.ROOT);
    }

    /**
     * @param code non-null only in a deployment that explicitly opted into exposing it, which is
     *             never a real one
     */
    public record RequestResult(int expiresInMinutes, boolean emailed, String code) {
    }
}
