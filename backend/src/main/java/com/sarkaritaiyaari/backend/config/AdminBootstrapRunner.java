package com.sarkaritaiyaari.backend.config;

import com.sarkaritaiyaari.backend.entity.Role;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.repository.UserRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.stereotype.Component;

/**
 * Creates the first admin account on startup, from {@code admin.bootstrap-email} /
 * {@code admin.bootstrap-password} (set in the gitignored application-local.yml — see
 * application-local.yml.example). There is no other way to get the first admin: public
 * registration always creates a STUDENT, and every admin-only endpoint (including the
 * one that creates further admins) requires an admin token to already exist.
 *
 * Idempotent — does nothing once any ADMIN-role user exists, so the properties are safe
 * to leave set across restarts.
 */
@Component
public class AdminBootstrapRunner implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(AdminBootstrapRunner.class);

    private final UserRepository userRepository;
    private final BCryptPasswordEncoder passwordEncoder = new BCryptPasswordEncoder();
    private final String bootstrapEmail;
    private final String bootstrapPassword;

    public AdminBootstrapRunner(UserRepository userRepository,
                                 @Value("${admin.bootstrap-email:}") String bootstrapEmail,
                                 @Value("${admin.bootstrap-password:}") String bootstrapPassword) {
        this.userRepository = userRepository;
        this.bootstrapEmail = bootstrapEmail;
        this.bootstrapPassword = bootstrapPassword;
    }

    @Override
    public void run(ApplicationArguments args) {
        if (bootstrapEmail.isBlank() || bootstrapPassword.isBlank()) {
            return;
        }
        if (userRepository.existsByRole(Role.ADMIN)) {
            return;
        }

        String email = bootstrapEmail.trim().toLowerCase();
        if (userRepository.existsByEmail(email)) {
            log.warn("admin.bootstrap-email ({}) already exists as a non-admin account — skipping bootstrap. "
                    + "Promote it directly in the database, or use a different bootstrap email.", email);
            return;
        }

        User admin = new User();
        admin.setEmail(email);
        admin.setPasswordHash(passwordEncoder.encode(bootstrapPassword));
        admin.setRole(Role.ADMIN);
        userRepository.save(admin);

        log.warn("Bootstrapped the first admin account ({}). "
                + "Sign in via the admin console, then use POST /api/auth/admin/register for teammates.", email);
    }
}
