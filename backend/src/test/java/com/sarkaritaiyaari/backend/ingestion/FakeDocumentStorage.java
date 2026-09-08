package com.sarkaritaiyaari.backend.ingestion;

import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

/**
 * TASK-2401 Task 4 test fixture -- replaces {@link CloudinaryDocumentStorage} in every
 * test run via {@code @Primary}. This is a functional necessity, not just a preference:
 * this dev environment has no real Cloudinary credentials (see {@code memory/STATUS.md}),
 * so any test that actually called the real implementation would fail with an auth
 * error. Never registered outside the test classpath, same as
 * {@code FixtureNoticeSourceAdapter}'s own precedent.
 */
@Component
@Primary
public class FakeDocumentStorage implements DocumentStorage {

    @Override
    public String upload(byte[] bytes, String filename) {
        return "https://fake-storage.invalid/" + filename;
    }
}
