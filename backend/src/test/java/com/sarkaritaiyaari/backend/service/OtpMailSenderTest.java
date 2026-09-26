package com.sarkaritaiyaari.backend.service;

import jakarta.mail.BodyPart;
import jakarta.mail.Multipart;
import jakarta.mail.Part;
import jakarta.mail.internet.MimeMessage;
import org.junit.jupiter.api.Test;
import org.springframework.mail.MailSendException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.mail.javamail.JavaMailSenderImpl;

import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * The sign-in email itself, with no Spring context and no SMTP server: a JavaMailSender that
 * captures the message instead of sending it, and one that always fails.
 */
class OtpMailSenderTest {

    /** Captures instead of sending. */
    static class CapturingSender extends JavaMailSenderImpl {
        final List<MimeMessage> sent = new ArrayList<>();

        @Override
        public void send(MimeMessage message) {
            sent.add(message);
        }
    }

    static class FailingSender extends JavaMailSenderImpl {
        @Override
        public void send(MimeMessage message) {
            throw new MailSendException("smtp down");
        }
    }

    @Test
    void theEmailCarriesTheCodeInBothAnHtmlAndAPlainTextPart() throws Exception {
        CapturingSender smtp = new CapturingSender();
        OtpMailSender sender = new OtpMailSender(Optional.of(smtp), true, "noreply@example.com", "SarkariTaiyaari");

        sender.sendCode("student<script>@gmail.com", "482913", 10);

        assertThat(smtp.sent).hasSize(1);
        MimeMessage message = smtp.sent.get(0);
        message.saveChanges(); // resolves the real content types, as the transport would
        assertThat(message.getSubject()).isEqualTo("482913 is your SarkariTaiyaari verification code");

        List<String> html = new ArrayList<>();
        List<String> text = new ArrayList<>();
        collect(message, html, text);

        assertThat(text).singleElement().satisfies(t -> {
            assertThat(t).contains("482913").contains("expires in 10 minutes").contains("never share this code");
        });
        assertThat(html).singleElement().satisfies(h -> {
            // One unbroken run of digits, so "copy" gets the whole code.
            assertThat(h).contains(">482913<");
            assertThat(h).contains("Verify your email").contains("10 minutes");
            // Placeholders all replaced, and the address escaped rather than injected.
            assertThat(h).doesNotContain("{{");
            assertThat(h).doesNotContain("<script>").contains("&lt;script&gt;");
        });
    }

    @Test
    void aFailedSendIsReportedRatherThanSwallowed() {
        OtpMailSender sender = new OtpMailSender(Optional.of(new FailingSender()), true, "noreply@example.com", "App");

        assertThatThrownBy(() -> sender.sendCode("a@gmail.com", "123456", 10))
                .isInstanceOf(EmailDeliveryException.class)
                .hasMessageNotContaining("123456");
    }

    @Test
    void mailSwitchedOnButMisconfiguredIsAFailureNotALoggedCode() {
        // Enabled, but no sender address: before 2026-09-24 this fell back to logging the code.
        OtpMailSender sender = new OtpMailSender(Optional.<JavaMailSender>of(new CapturingSender()), true, "", "App");

        assertThat(sender.isDelivering()).isFalse();
        assertThatThrownBy(() -> sender.sendCode("a@gmail.com", "123456", 10))
                .isInstanceOf(EmailDeliveryException.class);
    }

    @Test
    void mailSwitchedOffDoesNotThrow() {
        OtpMailSender sender = new OtpMailSender(Optional.empty(), false, "", "App");
        sender.sendCode("a@gmail.com", "123456", 10);
        assertThat(sender.isDelivering()).isFalse();
    }

    @Test
    void addressesAreMaskedForLogs() {
        assertThat(OtpMailSender.maskEmail("venkatesh@gmail.com")).isEqualTo("v***h@gmail.com");
        assertThat(OtpMailSender.maskEmail("ab@gmail.com")).isEqualTo("a***@gmail.com");
        assertThat(OtpMailSender.maskEmail(null)).isEqualTo("(none)");
    }

    private static void collect(Part part, List<String> html, List<String> text) throws Exception {
        Object content = part.getContent();
        if (content instanceof Multipart multipart) {
            for (int i = 0; i < multipart.getCount(); i++) {
                BodyPart child = multipart.getBodyPart(i);
                collect(child, html, text);
            }
        } else if (part.isMimeType("text/html")) {
            html.add((String) content);
        } else if (part.isMimeType("text/plain")) {
            text.add((String) content);
        }
    }
}
