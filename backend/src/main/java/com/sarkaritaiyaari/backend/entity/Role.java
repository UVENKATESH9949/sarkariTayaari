package com.sarkaritaiyaari.backend.entity;

public enum Role {
    STUDENT,
    ADMIN,
    /**
     * Exam Guide spec §36 — can move a cycle from REVIEW to PUBLISHED or back to DRAFT
     * (with a reason), but has none of ADMIN's other content-CRUD powers. ADMIN can also
     * perform every REVIEWER action (a superset, not a disjoint role) — see
     * {@code AuthService.requireReviewer} — so a solo operator with no separate reviewer
     * account isn't locked out of publishing their own content.
     */
    REVIEWER
}
