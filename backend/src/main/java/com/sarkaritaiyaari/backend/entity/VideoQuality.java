package com.sarkaritaiyaari.backend.entity;

/**
 * Bitrate/resolution variant of the same lesson.
 *
 * <p>Exists so a low-bandwidth variant can be added later without touching the owner
 * relationship. Nothing produces LOW or HIGH yet; every rendered lesson is STANDARD.
 * The point of declaring it now is that the uniqueness key already accounts for it, so adding a
 * variant is a new row rather than a migration.
 */
public enum VideoQuality {
    LOW,
    STANDARD,
    HIGH
}
