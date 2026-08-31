package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.service.SyntheticCurationService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * An operational entry point, not a test — it seeds (or purges) the synthetic Epic L
 * curation data against whatever database {@code application-local.yml} points at.
 *
 * <h2>Why this is a JUnit class</h2>
 * The seeding endpoints require an admin token, and the only working admin account's password
 * is deliberately not recorded anywhere in this repo (it is public). The test harness already
 * solves exactly this problem — it fabricates a real admin token against the real database —
 * so reusing it is cheaper and safer than either inventing a second unauthenticated code
 * path or writing a credential down. This class autowires the service directly and skips HTTP
 * entirely.
 *
 * <h2>Why it cannot run by accident</h2>
 * Gated on an environment variable rather than {@code @Disabled}, so it is invisible to
 * {@code mvn test} and to CI, and enabling it is an explicit, visible act:
 *
 * <pre>
 *   # seed
 *   EPIC_L_SEED=seed  mvn test -Dtest=SyntheticCurationSeedRunner
 *   # remove it again
 *   EPIC_L_SEED=purge mvn test -Dtest=SyntheticCurationSeedRunner
 * </pre>
 *
 * <p>Environment variables are inherited by Surefire's forked JVM, which system properties
 * passed to {@code mvn} are not — hence the env var rather than {@code -DepicL.seed=true}.
 *
 * <p>It deliberately does <em>not</em> extend {@link AbstractIntegrationTest}: that class's
 * {@code @AfterEach} exists to leave the database as it found it, which is the exact opposite
 * of the point here.
 */
@SpringBootTest
@EnabledIfEnvironmentVariable(named = "EPIC_L_SEED", matches = "seed|purge")
class SyntheticCurationSeedRunner {

    @Autowired
    private SyntheticCurationService synthetic;

    @Test
    void seedOrPurge() {
        String mode = System.getenv("EPIC_L_SEED");

        // Asserted rather than assumed: if the flag is off the service throws, and the failure
        // message would name a permission problem rather than a missing config line.
        assertThat(synthetic.isEnabled())
                .as("app.epic-l.synthetic-seed-enabled must be true in application-local.yml")
                .isTrue();

        Map<String, Object> report = "purge".equals(mode) ? synthetic.purge() : synthetic.seed();

        // Printed, not logged: this class is run by a human reading the console, and the report
        // is the entire output that matters.
        System.out.println("=== Epic L synthetic curation (" + mode + ") ===");
        report.forEach((key, value) -> System.out.println("  " + key + ": " + value));

        assertThat(report).isNotEmpty();
    }
}
