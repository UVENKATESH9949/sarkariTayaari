package com.sarkaritaiyaari.backend.entity;

/** Spec §11's three statuses for one user against one document requirement. */
public enum UserDocumentReadiness {
    READY,
    MISSING,
    NOT_APPLICABLE,
}
