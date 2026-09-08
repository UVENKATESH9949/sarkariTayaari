package com.sarkaritaiyaari.backend.ingestion;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

/**
 * TEMPORARY local-dev-only bypass for {@link CloudinaryDocumentStorage} -- this machine has
 * no real Cloudinary credentials (see {@code memory/STATUS.md}'s repeatedly-disclosed gap
 * across TASK-2401/TASK-2501), so the real upload call always fails with
 * "Unknown API key unused-placeholder". Gated by {@code app.document-storage.fake}, set only
 * in the gitignored {@code application-local.yml} on this machine -- never true in any
 * deployed environment, and never committed. Everything downstream of storage (PDF text
 * extraction, question splitting, candidates, Accept, Publish) is still genuinely real; only
 * the PDF's own archival copy on Cloudinary is skipped.
 *
 * <p>Not a permanent fixture -- delete this class (and the config flag) once real Cloudinary
 * credentials are available, or once a one-off verification session using it is done.
 *
 * <p>{@code @ConditionalOnMissingBean(name = "fakeDocumentStorage")} is load-bearing, not
 * incidental: {@code application-local.yml} (which enables this bean) is read by {@code mvn
 * test} too, and the test source tree's own {@code FakeDocumentStorage} is unconditionally
 * {@code @Primary} -- without this guard, running the test suite while this flag is on
 * fails every Spring context with "more than one 'primary' bean found", found by actually
 * running the suite this way, not by review.
 */
@Component
@Primary
@ConditionalOnProperty(prefix = "app.document-storage", name = "fake", havingValue = "true")
@ConditionalOnMissingBean(name = "fakeDocumentStorage")
public class LocalDevFakeDocumentStorage implements DocumentStorage {

    @Override
    public String upload(byte[] bytes, String filename) {
        return "https://fake-storage.invalid/" + filename;
    }
}
