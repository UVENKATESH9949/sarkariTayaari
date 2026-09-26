package com.sarkaritaiyaari.backend.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import jakarta.mail.internet.MimeMessage;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.stereotype.Component;
import org.springframework.web.util.HtmlUtils;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Year;
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
 * leaves the building. **A deployment that turns mail on never logs a code — even when its mail
 * settings are incomplete** (that is a delivery failure, 2026-09-24; it used to fall back to the
 * log); a deployment that leaves it off never sends one.
 *
 * <h2>The message (2026-09-24)</h2>
 * A branded HTML email with a plain-text alternative, from {@code resources/mail/otp-code.html}
 * and {@code .txt}. The brand is a text wordmark, not an image, because no logo is hosted at a
 * public address yet; and the footer carries no support address, phone or policy links, because
 * none exist yet. Add them to both templates when they do — never invent them.
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
    private final String htmlTemplate;
    private final String textTemplate;

    public OtpMailSender(Optional<JavaMailSender> mailSender,
                         @Value("${app.mail.enabled:false}") boolean enabled,
                         @Value("${app.mail.from:}") String from,
                         @Value("${app.mail.app-name:SarkariTaiyaari}") String appName) {
        this.mailSender = mailSender;
        this.enabled = enabled;
        this.from = from;
        this.appName = appName;
        this.htmlTemplate = loadTemplate("mail/otp-code.html");
        this.textTemplate = loadTemplate("mail/otp-code.txt");
    }

    /** True when a real message would actually leave the building. */
    public boolean isDelivering() {
        return enabled && mailSender.isPresent() && !from.isBlank();
    }

    /**
     * Sends the code, or — only on a deployment with mail switched OFF — logs it for a developer.
     *
     * <p>Throws {@link EmailDeliveryException} when mail is switched on and the message could not be
     * sent. That used to be swallowed, so the app told the student a code was on its way when nothing
     * had left the server. Throwing is safe for the no-membership-oracle rule because it happens for
     * every address alike: whether an account exists never changes whether SMTP works.
     */
    public void sendCode(String email, String code, int validMinutes) {
        if (!enabled) {
            /*
             * The developer path, and ONLY when mail is deliberately off. A deployment that turned
             * mail on but misconfigured it (no sender address, no SMTP bean) is a delivery failure
             * below — never a reason to print a live code into a production log.
             */
            log.warn("otp.mail disabled — code for {} is {} (valid {} minutes). "
                            + "Set app.mail.enabled=true with SMTP credentials to send it for real.",
                    maskEmail(email), code, validMinutes);
            return;
        }
        if (!isDelivering()) {
            log.error("otp.mail enabled but not configured (sender address or SMTP missing); nothing sent to {}",
                    maskEmail(email));
            throw new EmailDeliveryException("We couldn't send the email right now. Please try again in a minute.");
        }

        try {
            MimeMessage message = mailSender.get().createMimeMessage();
            // multipart=true gives multipart/alternative: clients that cannot render HTML show the text part.
            MimeMessageHelper helper = new MimeMessageHelper(message, true, StandardCharsets.UTF_8.name());
            helper.setFrom(from, appName);
            helper.setTo(email);
            /*
             * The code leads the subject deliberately. It is what a phone's notification shows, and
             * it is the shape mail clients (Gmail's "Copy code", iOS/Android code suggestions) look
             * for. The trade-off — the code is visible on a lock screen — is the industry norm for a
             * short-lived, single-use code, and it is still useless without the address it was sent to.
             */
            helper.setSubject(code + " is your " + appName + " verification code");
            helper.setText(render(textTemplate, email, code, validMinutes, false),
                    render(htmlTemplate, email, code, validMinutes, true));
            mailSender.get().send(message);
            log.info("otp.mail sent to {}", maskEmail(email));
        } catch (Exception ex) {
            // Logged with a masked address but never the code: a stack trace is a likely thing to
            // paste into a ticket, and a live credential should not travel with it.
            log.error("otp.mail failed for {}: {}", maskEmail(email), ex.getMessage());
            throw new EmailDeliveryException("We couldn't send the email right now. Please try again in a minute.");
        }
    }

    private String render(String template, String email, String code, int validMinutes, boolean html) {
        String safeEmail = html ? HtmlUtils.htmlEscape(email) : email;
        String safeName = html ? HtmlUtils.htmlEscape(appName) : appName;
        return template
                .replace("{{CODE}}", code)
                .replace("{{MINUTES}}", Integer.toString(validMinutes))
                .replace("{{EMAIL}}", safeEmail)
                .replace("{{APP_NAME}}", safeName)
                .replace("{{YEAR}}", Integer.toString(Year.now().getValue()));
    }

    private static String loadTemplate(String path) {
        try (var in = new ClassPathResource(path).getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException ex) {
            // Fails at startup, loudly, rather than at the first sign-in attempt.
            throw new IllegalStateException("Missing mail template " + path, ex);
        }
    }

    /**
     * "venkatesh@gmail.com" -> "v***h@gmail.com". Enough to tell two support cases apart in a log,
     * not enough to be a list of students' addresses.
     */
    static String maskEmail(String email) {
        if (email == null) return "(none)";
        int at = email.indexOf('@');
        if (at <= 0) return "***";
        String local = email.substring(0, at);
        String masked = local.length() <= 2
                ? local.charAt(0) + "***"
                : local.charAt(0) + "***" + local.charAt(local.length() - 1);
        return masked + email.substring(at);
    }
}
