package com.sarkaritaiyaari.backend.video;

import java.net.URI;
import java.util.Optional;

/**
 * Where video bytes live.
 *
 * <p>Deliberately NOT reusing {@code DocumentStorage}, whose single method returns a public URL.
 * That shape is fine for a question image and wrong for video: it makes the asset reachable by
 * anyone who has the link, which defeats entitlement. This interface hands back an opaque
 * <em>key</em> instead, and resolution to bytes goes back through the backend, so the backend
 * stays the thing that decides who may watch.
 *
 * <p>The local-filesystem implementation is the one wired up today. It is correct for development
 * and for a single long-lived host, and it is NOT correct on Cloud Run, whose filesystem is
 * ephemeral and whose instances scale to zero - a video written on one request can be gone by the
 * next. That is a deployment decision, not a code change: swapping in an object-storage
 * implementation is one class and one config value, which is the whole reason this interface
 * exists rather than calls to a storage SDK scattered through the service.
 */
public interface VideoStorage {

    /**
     * Stores bytes under a caller-supplied key and returns the key actually used.
     *
     * @param key        a stable, caller-chosen identifier, e.g. {@code "lesson-videos/<uuid>/1.mp4"}
     * @param bytes      the file
     * @param mimeType   the content type to serve it back as
     * @return the storage key to persist on the row
     */
    String store(String key, byte[] bytes, String mimeType);

    /**
     * Resolves a key to bytes this backend can serve itself, or empty when this store does not
     * serve bytes (see {@link #deliveryUrl}).
     */
    Optional<StoredVideo> open(String key);

    /**
     * A URL the client may fetch the file from directly, or empty when this store has none and
     * the bytes must be served through {@link #open}.
     *
     * <p>This exists so an object store is not proxied through the backend. Streaming every 9MB
     * lesson through a Cloud Run instance would double egress, add latency, and put real memory
     * pressure on a service sized for JSON - and this project has already suspected Cloud Run
     * memory as the cause of mid-sync failures once.
     *
     * <p><strong>Entitlement is not weakened by handing out a URL.</strong> The URL is issued only
     * after the caller has been checked, and an implementation should make it unguessable and
     * short-lived. What matters is that the backend decides who gets access, not that every byte
     * flows through it.
     */
    default Optional<URI> deliveryUrl(String key) {
        return Optional.empty();
    }

    /** Removes the stored bytes. A missing key is not an error - deletion is idempotent. */
    void delete(String key);
}
