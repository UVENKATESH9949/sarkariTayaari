package com.sarkaritaiyaari.backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;

import java.util.Optional;

/**
 * Delivers a sign-in code to a student's inbox, or to the log when no mail account is configured.
 *
 * <h2>Why the log fallback exists, and why it is safe</h2>
 * A deployment with no SMTP credentials cannot send email, and the honest options are to fail the
 * request or to put the code somewhere a developer can reach it. Failing would make the entire
 * sign-in flow untestable until a credential exists, which is how a feature ships unexercised.
 *
 * <p>It is gated on {@code app.mail.enabled}, which defaults to <b>false</b>, matching this
 * project's standing "off unless explicitly turned on" posture for anything that costs money or
 * leaves the building. **A deployment that turns mail on never logs a code**; a deployment that
 * leaves it off never sends one. The two paths are exclusive, so a production instance cannot
 * quietly print live credentials to its log.
 *
 * <p>Switching to a different provider is a configuration change, not a code change: any SMTP host
 * works, because nothing here is Gmail-specific beyond the defaults in {@code application.yml}.
 */
@Component
public class OtpMailSender {

    private static final Logger log = LoggerFactory.getLogger(OtpMailSender.class);

    private final Optional<JavaMailSender> mailSender;
    private final boolean enabled;
    private final String from;
    private final String appName;

    public OtpMailSender(Optional<JavaMailSender> mailSender,
                         @Value("${app.mail.enabled:false}") boolean enabled,
                         @Value("${app.mail.from:}") String from,
                         @Value("${app.mail.app-name:SarkariTaiyaari}") String appName) {
        this.mailSender = mailSender;
        this.enabled = enabled;
        this.from = from;
        this.appName = appName;
    }

    /** True when a real message would actually leave the building. */
    public boolean isDelivering() {
        return enabled && mailSender.isPresent() && !from.isBlank();
    }

    /**
     * Never throws. A delivery failure must not fail the request that triggered it — the endpoint
     * deliberately answers the same way whether or not the address exists, and letting SMTP
     * decide the status code would leak exactly the thing that design protects.
     */
    public void sendCode(String email, String code, int validMinutes) {
        if (!isDelivering()) {
            /*
             * The developer path. Logged at WARN rather than INFO so it is impossible to miss in a
             * deployment that meant to have mail switched on.
             */
            log.warn("otp.mail disabled — code for {} is {} (valid {} minutes). "
                            + "Set app.mail.enabled=true with SMTP credentials to send it for real.",
                    email, code, validMinutes);
            return;
        }

        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(from);
            message.setTo(email);
            message.setSubject(appName + " sign-in code: " + code);
            message.setText(
                    "Your " + appName + " sign-in code is:\n\n"
                            + "    " + code + "\n\n"
                            + "It expires in " + validMinutes + " minutes and can be used once.\n\n"
                            + "If you did not ask to sign in, you can ignore this email — "
                            + "nobody can get into your account with this alone.\n");
            mailSender.get().send(message);
            log.info("otp.mail sent to {}", email);
        } catch (Exception ex) {
            // Logged with the address but never the code: a stack trace is a likely thing to paste
            // into a ticket, and a live credential should not travel with it.
            log.error("otp.mail failed for {}: {}", email, ex.getMessage());
        }
    }
}
