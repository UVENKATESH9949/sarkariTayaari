package com.sarkaritaiyaari.backend.ingestion;

/**
 * TASK-2401 Document 5 -- where a document's raw bytes actually live. One real
 * implementation ({@link CloudinaryDocumentStorage}, reusing the existing Cloudinary
 * credential/SDK {@code ImageUploadService} already uses -- Cloud Run's ephemeral disk
 * rules out local storage, a confirmed failure mode via the {@code /downloads} APK
 * hosting precedent). Kept as an interface so a test can swap in a fake rather than ever
 * needing real Cloudinary credentials.
 */
public interface DocumentStorage {

    /** Returns the stored file's public URL. */
    String upload(byte[] bytes, String filename);
}
