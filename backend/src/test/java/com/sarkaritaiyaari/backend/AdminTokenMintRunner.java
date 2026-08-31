package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.entity.Role;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.entity.UserToken;
import com.sarkaritaiyaari.backend.repository.UserRepository;
import com.sarkaritaiyaari.backend.repository.UserTokenRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import java.time.OffsetDateTime;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Mints a short-lived admin token so the admin console can be click-tested in a real browser.
 *
 * <h2>Why this exists</h2>
 * The admin console's newest screens had never been exercised in a browser, and the reason was
 * access: the only working admin account's password is deliberately not recorded anywhere in this
 * repo (it is public), and the account the docs used to name was demoted to STUDENT. That left a
 * whole class of bug unfindable — the shadowed-import bug found in the Epic L admin work built
 * clean and passed lint while silently persisting nothing, and only clicking Save would have
 * caught it.
 *
 * <h2>Why it does not touch a real account</h2>
 * The token is issued for {@code automated-test-admin@sarkaritaiyaari.internal}, the ADMIN-role
 * fixture {@link AbstractIntegrationTest} already creates and which {@code memory/STATUS.md}
 * already records as a known, harmless artifact. No human's credentials are involved, and no
 * password is created, printed or stored.
 *
 * <h2>Why it is safe to have in the repo</h2>
 * <ul>
 *   <li>Gated on an environment variable, so it is invisible to {@code mvn test} and to CI.</li>
 *   <li>The token expires in {@link #TOKEN_TTL_MINUTES} minutes — the app's normal TTL is 365
 *       days, which would be an unacceptable thing to leave lying around.</li>
 *   <li>It prints the token to the console only. Nothing is written to a file.</li>
 *   <li>{@code EPIC_L_MINT_TOKEN=revoke} deletes every token this class has issued.</li>
 * </ul>
 *
 * <pre>
 *   EPIC_L_MINT_TOKEN=mint   mvn test -Dtest=AdminTokenMintRunner
 *   EPIC_L_MINT_TOKEN=revoke mvn test -Dtest=AdminTokenMintRunner
 * </pre>
 */
@SpringBootTest
@EnabledIfEnvironmentVariable(named = "EPIC_L_MINT_TOKEN", matches = "mint|revoke")
class AdminTokenMintRunner {

    /** Short by design — see the class comment. Long enough for one manual verification pass. */
    private static final int TOKEN_TTL_MINUTES = 45;

    /** Prefix that makes every token this class issues identifiable, so revoke can find them. */
    private static final String TOKEN_PREFIX = "ui-verify-";

    private static final String FIXTURE_ADMIN_EMAIL = "automated-test-admin@sarkaritaiyaari.internal";

    @Autowired
    private UserRepository users;

    @Autowired
    private UserTokenRepository tokens;

    @Test
    void mintOrRevoke() {
        if ("revoke".equals(System.getenv("EPIC_L_MINT_TOKEN"))) {
            int revoked = 0;
            for (UserToken token : tokens.findAll()) {
                if (token.getToken().startsWith(TOKEN_PREFIX)) {
                    tokens.deleteById(token.getToken());
                    revoked++;
                }
            }
            System.out.println("=== Revoked " + revoked + " UI-verification token(s) ===");
            return;
        }

        User admin = users.findByEmail(FIXTURE_ADMIN_EMAIL).orElseGet(() -> {
            User created = new User();
            created.setEmail(FIXTURE_ADMIN_EMAIL);
            // No usable password: this account is only ever reachable via a minted token, which is
            // the point. A password would make it a real, permanently exploitable admin login.
            created.setPasswordHash("not-a-usable-password-hash");
            created.setRole(Role.ADMIN);
            return users.save(created);
        });

        assertThat(admin.getRole()).isEqualTo(Role.ADMIN);

        UserToken token = new UserToken();
        token.setToken(TOKEN_PREFIX + UUID.randomUUID());
        token.setUser(admin);
        token.setExpiresAt(OffsetDateTime.now().plusMinutes(TOKEN_TTL_MINUTES));
        tokens.save(token);

        System.out.println("=== ADMIN_UI_TOKEN " + token.getToken() + " ===");
        System.out.println("=== expires in " + TOKEN_TTL_MINUTES + " minutes ===");
    }
}
