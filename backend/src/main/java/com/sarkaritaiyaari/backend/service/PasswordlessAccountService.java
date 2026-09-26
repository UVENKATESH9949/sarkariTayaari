package com.sarkaritaiyaari.backend.service;

import com.sarkaritaiyaari.backend.entity.Role;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.repository.UserRepository;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.util.Base64;
import java.util.Locale;
import java.util.Optional;

/**
 * The one place a passwordless account is found or created — by an emailed code (V51) or by a
 * Google sign-in (2026-09-25).
 *
 * <h2>Account linking is by verified email, and that is the whole rule</h2>
 * Both ways in end at {@link #findOrCreate}, keyed on the lower-cased address. A student who signed
 * up with a code and later taps "Continue with Google" with the same Gmail lands in the SAME
 * account, with the same history — never a second one. That is safe only because both paths have
 * already proven control of that address: the code by receiving it, Google by asserting
 * {@code email_verified}. Nothing else may call this with an unverified address.
 */
@Service
@Transactional
public class PasswordlessAccountService {

    private final UserRepository userRepository;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder();
    private final SecureRandom random = new SecureRandom();

    public PasswordlessAccountService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    /** @param verifiedEmail an address whose ownership the caller has already proven */
    public Result findOrCreate(String verifiedEmail) {
        String email = verifiedEmail.trim().toLowerCase(Locale.ROOT);
        Optional<User> existing = userRepository.findByEmail(email);
        if (existing.isPresent()) {
            return new Result(existing.get(), false);
        }
        return new Result(create(email), true);
    }

    /**
     * {@code users.password_hash} is NOT NULL and deliberately left that way — relaxing a column on
     * the busiest table in the schema to serve a new sign-in path is a bigger change than this
     * needs. The row gets a hash of random bytes nobody has ever seen, so password sign-in for this
     * account can never succeed. The standard "unusable password" pattern.
     */
    private User create(String email) {
        byte[] unguessable = new byte[32];
        random.nextBytes(unguessable);

        User user = new User();
        user.setEmail(email);
        user.setPasswordHash(encoder.encode(Base64.getEncoder().encodeToString(unguessable)));
        user.setRole(Role.STUDENT);
        userRepository.save(user);
        return user;
    }

    public record Result(User user, boolean created) {
    }
}
