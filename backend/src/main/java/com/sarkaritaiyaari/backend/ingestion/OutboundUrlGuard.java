package com.sarkaritaiyaari.backend.ingestion;

import java.net.InetAddress;
import java.net.URI;
import java.net.UnknownHostException;

/**
 * TASK-2401 Document 16 -- this ingestion pipeline is the first place in this backend
 * that fetches an arbitrary external URL server-side. {@code ingestion_sources.base_url}
 * is admin-entered, not end-user-entered, but the fetcher must still not trust it
 * blindly: SSRF hardening is standard practice for any server-side URL fetch, not
 * something specific to how trusted the caller happens to be. Rejects anything that
 * isn't a plain http(s) URL resolving only to public IP addresses -- no loopback, no
 * RFC 1918/site-local ranges, no link-local (which also covers the
 * {@code 169.254.169.254} cloud metadata endpoint), no multicast.
 */
public final class OutboundUrlGuard {

    private OutboundUrlGuard() {
    }

    public static void requireSafe(String url) {
        URI uri;
        try {
            uri = URI.create(url);
        } catch (IllegalArgumentException e) {
            throw new IllegalArgumentException("Not a valid URL: " + url, e);
        }

        String scheme = uri.getScheme();
        if (scheme == null || !(scheme.equalsIgnoreCase("http") || scheme.equalsIgnoreCase("https"))) {
            throw new IllegalArgumentException("Only http/https URLs are allowed: " + url);
        }

        String host = uri.getHost();
        if (host == null || host.isBlank()) {
            throw new IllegalArgumentException("URL has no host: " + url);
        }

        InetAddress[] addresses;
        try {
            addresses = InetAddress.getAllByName(host);
        } catch (UnknownHostException e) {
            throw new IllegalArgumentException("Cannot resolve host: " + host, e);
        }

        for (InetAddress address : addresses) {
            if (address.isLoopbackAddress() || address.isAnyLocalAddress() || address.isLinkLocalAddress()
                    || address.isSiteLocalAddress() || address.isMulticastAddress()) {
                throw new IllegalArgumentException(
                        "URL resolves to a non-public address (" + address.getHostAddress() + "): " + url);
            }
        }
    }
}
