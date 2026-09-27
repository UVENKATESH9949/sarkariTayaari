package com.sarkaritaiyaari.backend.entity;

/** How a video came to exist. Recorded because a reviewer should know what they are approving. */
public enum VideoSource {
    /** Rendered elsewhere (the AI Video Studio) and uploaded through the admin console. */
    ADMIN_UPLOAD,
    /** Produced by an on-demand generation run. Nothing emits this yet. */
    AI_GENERATED
}
