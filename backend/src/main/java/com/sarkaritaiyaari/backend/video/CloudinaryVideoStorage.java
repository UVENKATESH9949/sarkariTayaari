package com.sarkaritaiyaari.backend.video;

import com.cloudinary.Cloudinary;
import com.cloudinary.utils.ObjectUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.URI;
import java.util.Map;
import java.util.Optional;

/**
 * Stores lesson videos in Cloudinary, the object store this project already uses for images and
 * ingested PDFs.
 *
 * <p>This is the implementation intended for any real deployment.
 * {@link LocalFilesystemVideoStorage} is correct for development and wrong on Cloud Run, whose
 * filesystem is ephemeral and whose instances scale to zero.
 *
 * <p><strong>Uploaded as {@code type: authenticated}, not the default {@code upload}.</strong> An
 * {@code upload}-type asset is served from a public URL that anyone who has it can pass on, which
 * would make a premium video ungated in practice. An {@code authenticated} asset cannot be fetched
 * without a signature this backend produces with the API secret, so the backend remains the thing
 * that decides who may watch.
 *
 * <p><strong>Delivery is a URL, not a proxy.</strong> Streaming every 9MB lesson through the
 * backend would double egress and put real memory pressure on a service sized for JSON. The URL is
 * issued only after the caller has passed the entitlement check.
 *
 * <p><strong>The honest limit on expiry.</strong> {@code privateDownload} produces a link carrying
 * an {@code expires_at}, which is what {@link #urlTtlSeconds} sets. If the account rejects it -
 * time-limited delivery is not available on every Cloudinary plan - this falls back to a signed
 * authenticated URL, which is unguessable but does <em>not</em> expire once issued. That fallback
 * is logged, so a deployment never silently believes its links expire when they do not.
 *
 * <p>Plain {@code upload} is used rather than {@code upload_large}: Cloudinary only requires
 * chunked upload past 100MB, and this application caps a video at 20MB well before that.
 */
@Component
@ConditionalOnProperty(name = "app.video-storage.provider", havingValue = "cloudinary")
public class CloudinaryVideoStorage implements VideoStorage {

    private static final Logger log = LoggerFactory.getLogger(CloudinaryVideoStorage.class);

    private static final String RESOURCE_TYPE = "video";
    private static final String DELIVERY_TYPE = "authenticated";
    private static final String FORMAT = "mp4";

    private final Cloudinary cloudinary;
    private final int urlTtlSeconds;

    public CloudinaryVideoStorage(Cloudinary cloudinary,
                                  @Value("${app.video-storage.url-ttl-seconds:3600}") int urlTtlSeconds) {
        this.cloudinary = cloudinary;
        this.urlTtlSeconds = urlTtlSeconds;
    }

    @Override
    public String store(String key, byte[] bytes, String mimeType) {
        String publicId = publicIdFor(key);
        try {
            Map<?, ?> result = cloudinary.uploader().upload(bytes, ObjectUtils.asMap(
                    "resource_type", RESOURCE_TYPE,
                    "type", DELIVERY_TYPE,
                    "public_id", publicId,
                    "overwrite", true,
                    "invalidate", true));
            log.info("video.storage cloudinary stored publicId={} bytes={} durationFromCloudinary={}",
                    publicId, bytes.length, result.get("duration"));
        } catch (IOException e) {
            throw new UncheckedIOException("Could not upload video to Cloudinary: " + publicId, e);
        }
        // The row keeps the key we were given, not Cloudinary's public id. deliveryUrl derives one
        // from the other, so the two can never disagree about where a file lives.
        return key;
    }

    /**
     * Cloudinary serves its own bytes, so there is nothing for the backend to stream.
     * {@link #deliveryUrl} is the path for this store.
     */
    @Override
    public Optional<StoredVideo> open(String key) {
        return Optional.empty();
    }

    @Override
    public Optional<URI> deliveryUrl(String key) {
        String publicId = publicIdFor(key);
        try {
            String expiring = cloudinary.privateDownload(publicId, FORMAT, ObjectUtils.asMap(
                    "resource_type", RESOURCE_TYPE,
                    "type", DELIVERY_TYPE,
                    "expires_at", (System.currentTimeMillis() / 1000L) + urlTtlSeconds));
            if (expiring != null && !expiring.isBlank()) {
                return Optional.of(URI.create(expiring));
            }
        } catch (Exception e) {
            // Not fatal, but it does change what the link means, so it is logged rather than
            // swallowed - a deployment must not believe its links expire when they do not.
            log.warn("video.storage cloudinary expiring URL unavailable for publicId={} "
                    + "- falling back to a signed URL that does NOT expire", publicId, e);
        }

        String signed = cloudinary.url()
                .resourceType(RESOURCE_TYPE)
                .type(DELIVERY_TYPE)
                .secure(true)
                .signed(true)
                .generate(publicId + "." + FORMAT);
        return signed == null || signed.isBlank() ? Optional.empty() : Optional.of(URI.create(signed));
    }

    @Override
    public void delete(String key) {
        String publicId = publicIdFor(key);
        try {
            cloudinary.uploader().destroy(publicId, ObjectUtils.asMap(
                    "resource_type", RESOURCE_TYPE,
                    "type", DELIVERY_TYPE,
                    "invalidate", true));
            log.info("video.storage cloudinary deleted publicId={}", publicId);
        } catch (Exception e) {
            // Best-effort, matching the local implementation: a leftover asset costs storage, not
            // correctness, and the row is already gone.
            log.warn("video.storage cloudinary could not delete publicId={}", publicId, e);
        }
    }

    /**
     * Cloudinary public ids carry no file extension - the format is a separate parameter - so the
     * storage key's trailing {@code .mp4} is stripped. Deriving this rather than storing a second
     * identifier is what stops the row and the asset drifting apart.
     */
    public static String publicIdFor(String key) {
        if (key == null || key.isBlank()) {
            throw new IllegalArgumentException("Storage key must not be blank");
        }
        return key.endsWith("." + FORMAT) ? key.substring(0, key.length() - (FORMAT.length() + 1)) : key;
    }
}
