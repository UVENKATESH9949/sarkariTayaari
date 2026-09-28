package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.video.CloudinaryVideoStorage;
import com.sarkaritaiyaari.backend.video.StoredObject;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * A real round trip against the real Cloudinary account. This is {@code TC-LESSONVIDEO-019}.
 *
 * <p><strong>Env-gated, and that is deliberate.</strong> It uploads to and deletes from a live
 * third-party account, so it must never run as part of an ordinary {@code mvn test} — the same
 * reason {@code ClaudeProviderRealApiTest} is gated. Run it explicitly:
 *
 * <pre>
 * CLOUDINARY_REAL_TESTS=true mvn -f backend/pom.xml test -Dtest=CloudinaryVideoStorageRealTest
 * </pre>
 *
 * <p><strong>Why the provider is overridden here rather than in config.</strong> The local config
 * deliberately keeps {@code app.video-storage.provider=local}, because flipping it globally would
 * make every {@code LessonVideoTest} publish push real MP4s into the live Cloudinary account on
 * every run. This class overrides it for itself only.
 *
 * <p>What it proves that nothing else can: that a real upload succeeds, that Cloudinary reports a
 * duration the code now reads instead of trusting a typed-in number, that the delivery URL works,
 * that an unsigned URL is refused (so a premium video is genuinely gated), and
 * <strong>whether this account's plan actually issues expiring links</strong> — which is the one
 * question {@code api/LESSON-VIDEOS.md} makes a claim about and could not verify.
 */
@SpringBootTest
@TestPropertySource(properties = "app.video-storage.provider=cloudinary")
@EnabledIfEnvironmentVariable(named = "CLOUDINARY_REAL_TESTS", matches = "true")
class CloudinaryVideoStorageRealTest {

    @Autowired
    private CloudinaryVideoStorage storage;

    @Test
    @DisplayName("a real video uploads, delivers through a signed URL, and deletes")
    void realRoundTrip() throws Exception {
        // Namespaced and unique so a failed run can never collide with or clobber real content.
        String key = "lesson-videos/_selftest/" + UUID.randomUUID() + "/v1.mp4";
        byte[] video = tinyMp4();

        StoredObject stored = null;
        try {
            stored = storage.store(key, video, "video/mp4");
            assertThat(stored.key()).isEqualTo(key);

            // The reason store() stopped returning a bare key: Cloudinary measures the file while
            // ingesting it, so duration is measured rather than typed in on the upload form.
            System.out.println("[cloudinary] duration=" + stored.durationSeconds()
                    + "s width=" + stored.width() + " height=" + stored.height());

            URI delivery = storage.deliveryUrl(key).orElseThrow(
                    () -> new AssertionError("Cloudinary returned no delivery URL"));

            // Does the signed URL actually serve the bytes?
            HttpResponse<byte[]> signed = HttpClient.newHttpClient().send(
                    HttpRequest.newBuilder(delivery).GET().build(),
                    HttpResponse.BodyHandlers.ofByteArray());
            assertThat(signed.statusCode())
                    .as("signed delivery URL should serve the file")
                    .isEqualTo(200);
            assertThat(signed.body()).isEqualTo(video);

            // Does an UNSIGNED URL get refused? If it did not, every premium video would be
            // ungated in practice, which is the whole reason the asset is uploaded as
            // type=authenticated rather than the default type=upload.
            int unsignedStatus = statusOfUnsignedGuess(delivery);
            System.out.println("[cloudinary] unsigned URL status=" + unsignedStatus);
            assertThat(unsignedStatus)
                    .as("an unsigned request must not be served; entitlement depends on it")
                    .isNotEqualTo(200);

            // THE QUESTION api/LESSON-VIDEOS.md could not answer: does the link expire?
            boolean expiring = delivery.toString().contains("expires_at")
                    || delivery.toString().contains("/private_download")
                    || delivery.getRawQuery() != null && delivery.getRawQuery().contains("expires");
            System.out.println("[cloudinary] EXPIRING LINK SUPPORTED = " + expiring);
            System.out.println("[cloudinary] delivery host/path = "
                    + delivery.getHost() + delivery.getPath());
            // Deliberately NOT asserted. Time-limited delivery is not on every Cloudinary plan,
            // and the implementation already logs a WARN and falls back to a non-expiring signed
            // URL when the account refuses it. Failing here would turn a documented, accepted
            // limitation into a broken build; printing it answers the open question instead.
        } finally {
            if (stored != null) {
                // Always clean up. A stray object in a live account is exactly the mess this
                // project's own verification passes have been careful to avoid.
                storage.delete(key);
                System.out.println("[cloudinary] deleted " + key);
            }
        }
    }

    /**
     * Strips the signature from a signed URL to approximate what an outsider holding the public id
     * could construct. A non-200 is what we want.
     */
    private static int statusOfUnsignedGuess(URI signed) throws IOException {
        String stripped = signed.toString().replaceAll("[?&](signature|__cld_token__)=[^&]*", "");
        HttpURLConnection connection = (HttpURLConnection) URI.create(stripped).toURL().openConnection();
        connection.setRequestMethod("GET");
        connection.setInstanceFollowRedirects(false);
        try {
            return connection.getResponseCode();
        } finally {
            connection.disconnect();
        }
    }

    /**
     * A genuinely playable MP4 - one second of black at 128x128, H.264, 2.2KB.
     *
     * <p>A hand-built byte array will NOT do here, and finding that out is worth recording:
     * Cloudinary decodes what it is given and rejected a structurally-plausible stub (an ftyp box
     * plus an empty moov) with "Invalid video file". The application's own upload check is a
     * magic-byte test, which that stub passed - so this is the one place in the codebase where a
     * file has to be real rather than merely well-formed at the front.
     */
    private static byte[] tinyMp4() throws IOException {
        try (var in = CloudinaryVideoStorageRealTest.class.getResourceAsStream("/tiny-video.mp4")) {
            if (in == null) {
                throw new IllegalStateException("tiny-video.mp4 missing from test resources");
            }
            return in.readAllBytes();
        }
    }
}
