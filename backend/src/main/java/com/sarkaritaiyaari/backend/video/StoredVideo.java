package com.sarkaritaiyaari.backend.video;

import org.springframework.core.io.Resource;

/**
 * A stored video resolved to something servable.
 *
 * <p>Carrying a Spring {@link Resource} rather than a byte array is deliberate: Spring MVC gives
 * byte-range support for free when a controller returns a Resource, and range requests are what
 * lets a player seek without downloading the whole file first. Buffering a 9MB video into a byte
 * array per request would also put real memory pressure on a Cloud Run instance sized for JSON.
 */
public record StoredVideo(Resource resource, long sizeBytes, String mimeType) {
}
