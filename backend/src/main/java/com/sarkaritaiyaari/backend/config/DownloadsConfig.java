package com.sarkaritaiyaari.backend.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * Serves build artefacts (APKs) over HTTP so a test device can download them by URL
 * instead of the file being copied across by hand.
 *
 * Files are read from a directory on disk rather than from the jar: an APK is ~100MB
 * and packaging it into the application would be absurd. Drop a file into the folder
 * and it is immediately downloadable — no restart.
 *
 * This is a development convenience. Real distribution should go through Play, Firebase
 * App Distribution or similar, which handle versioning and update notifications; this
 * only exists so "send me the build" stops meaning "email a 100MB attachment".
 */
@Configuration
public class DownloadsConfig implements WebMvcConfigurer {

    private final Path downloadsDir;

    public DownloadsConfig(@Value("${app.downloads-dir:./downloads}") String downloadsDir) {
        this.downloadsDir = Paths.get(downloadsDir).toAbsolutePath().normalize();
    }

    public Path getDownloadsDir() {
        return downloadsDir;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        // A file: handler streams from disk and supports range requests, so a dropped
        // connection on a 100MB download can resume rather than start over.
        registry.addResourceHandler("/downloads/**")
                .addResourceLocations(downloadsDir.toUri().toString())
                .setCachePeriod(0);
    }
}
