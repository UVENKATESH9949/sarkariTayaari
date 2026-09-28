package com.sarkaritaiyaari.backend.video;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.core.io.FileSystemResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Optional;

/**
 * Stores video on the local filesystem under a configured root.
 *
 * <p>Correct for development and for a single long-lived host. NOT correct on Cloud Run, where
 * the filesystem is ephemeral and instances scale to zero, so a file written on one request can
 * be gone by the next - use {@link CloudinaryVideoStorage} there
 * ({@code app.video-storage.provider: cloudinary}).
 *
 * <p>This is the default only because it needs no credentials, so a fresh checkout works. It is
 * not the right choice for a real deployment.
 *
 * <p>Every key is resolved against the configured root and then checked to still be underneath
 * it. Without that check a key containing {@code ..} would read or write anywhere the process can
 * reach, and keys are partly derived from request data.
 */
@Component
@ConditionalOnProperty(name = "app.video-storage.provider", havingValue = "local", matchIfMissing = true)
public class LocalFilesystemVideoStorage implements VideoStorage {

    private static final Logger log = LoggerFactory.getLogger(LocalFilesystemVideoStorage.class);

    private final Path root;

    public LocalFilesystemVideoStorage(@Value("${app.video-storage.local-path:./var}") String localPath) {
        this.root = Paths.get(localPath).toAbsolutePath().normalize();
    }

    @Override
    public StoredObject store(String key, byte[] bytes, String mimeType) {
        Path target = resolve(key);
        try {
            Files.createDirectories(target.getParent());
            Files.write(target, bytes);
        } catch (IOException e) {
            throw new UncheckedIOException("Could not store video at key " + key, e);
        }
        log.info("video.storage stored key={} bytes={}", key, bytes.length);
        // Nothing here inspects the container, so duration and dimensions stay unknown rather
        // than being guessed at. Files.write also replaces an existing file, which is the
        // retry-safety the interface asks for.
        return StoredObject.of(key);
    }

    @Override
    public Optional<StoredVideo> open(String key) {
        Path target = resolve(key);
        if (!Files.isRegularFile(target)) {
            return Optional.empty();
        }
        try {
            long size = Files.size(target);
            return Optional.of(new StoredVideo(new FileSystemResource(target), size, "video/mp4"));
        } catch (IOException e) {
            log.warn("video.storage could not read key={}", key, e);
            return Optional.empty();
        }
    }

    @Override
    public void delete(String key) {
        try {
            Files.deleteIfExists(resolve(key));
        } catch (IOException e) {
            log.warn("video.storage could not delete key={}", key, e);
        }
    }

    /**
     * Resolves a key under the storage root, refusing anything that escapes it.
     *
     * <p>A key like {@code ../../application-local.yml} would otherwise be a real file-disclosure
     * bug, since the serve endpoint hands back whatever this returns.
     */
    private Path resolve(String key) {
        if (key == null || key.isBlank()) {
            throw new IllegalArgumentException("Storage key must not be blank");
        }
        Path candidate = root.resolve(key).normalize();
        if (!candidate.startsWith(root)) {
            throw new IllegalArgumentException("Storage key escapes the storage root: " + key);
        }
        return candidate;
    }
}
