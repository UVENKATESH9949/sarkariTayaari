package com.sarkaritaiyaari.backend.ai;

/** One model a provider currently offers. Always sourced live from the provider (§10) —
 * never a hardcoded list, so it can't silently go stale as a vendor adds/retires models. */
public record AIModelInfo(String id, String displayName) {
}
