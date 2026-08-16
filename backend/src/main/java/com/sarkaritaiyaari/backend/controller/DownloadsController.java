package com.sarkaritaiyaari.backend.controller;

import com.sarkaritaiyaari.backend.config.DownloadsConfig;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Comparator;
import java.util.List;

/**
 * A plain HTML index of whatever is in the downloads folder, so a phone can just open
 * the URL and tap a build rather than needing to know the exact filename.
 */
@RestController
public class DownloadsController {

    private static final DateTimeFormatter STAMP =
            DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm").withZone(ZoneId.systemDefault());

    private final DownloadsConfig downloadsConfig;

    public DownloadsController(DownloadsConfig downloadsConfig) {
        this.downloadsConfig = downloadsConfig;
    }

    @GetMapping(value = "/downloads", produces = MediaType.TEXT_HTML_VALUE)
    public String index() throws IOException {
        Path dir = downloadsConfig.getDownloadsDir();

        StringBuilder html = new StringBuilder("""
                <!doctype html>
                <html><head>
                <meta charset="utf-8">
                <meta name="viewport" content="width=device-width, initial-scale=1">
                <title>SarkariTaiyaari builds</title>
                <style>
                  body { font-family: system-ui, sans-serif; margin: 0; padding: 24px;
                         background: #f5f7fb; color: #1a2b4a; }
                  h1 { font-size: 20px; margin: 0 0 4px; }
                  p.sub { margin: 0 0 24px; color: #8a94a6; font-size: 14px; }
                  a.build { display: block; background: #fff; border: 1px solid #e3e8f0;
                            border-radius: 12px; padding: 16px; margin-bottom: 12px;
                            text-decoration: none; color: inherit; }
                  a.build:active { background: #eef2ff; }
                  .name { font-weight: 600; font-size: 15px; word-break: break-all; }
                  .meta { color: #8a94a6; font-size: 13px; margin-top: 4px; }
                  .empty { color: #8a94a6; font-size: 14px; }
                  .note { margin-top: 24px; font-size: 12.5px; color: #8a94a6; line-height: 1.5; }
                </style>
                </head><body>
                <h1>SarkariTaiyaari builds</h1>
                <p class="sub">Tap a build to download and install.</p>
                """);

        if (!Files.isDirectory(dir)) {
            html.append("<p class=\"empty\">No downloads folder yet (").append(dir).append(").</p>");
        } else {
            try (var files = Files.list(dir)) {
                List<Path> builds = files
                        .filter(Files::isRegularFile)
                        .sorted(Comparator.comparing(DownloadsController::lastModified).reversed())
                        .toList();

                if (builds.isEmpty()) {
                    html.append("<p class=\"empty\">Nothing here yet. Drop an APK into ")
                            .append(dir).append("</p>");
                }

                for (Path file : builds) {
                    long sizeMb = Files.size(file) / (1024 * 1024);
                    html.append("<a class=\"build\" href=\"/downloads/")
                            .append(file.getFileName()).append("\">")
                            .append("<div class=\"name\">").append(file.getFileName()).append("</div>")
                            .append("<div class=\"meta\">").append(sizeMb).append(" MB &middot; ")
                            .append(STAMP.format(lastModified(file))).append("</div>")
                            .append("</a>");
                }
            }
        }

        html.append("""
                <p class="note">
                  If Android blocks the install, allow "install unknown apps" for your browser.
                  Builds are signed with a debug key, so a build from a different machine will
                  not install over one from here &mdash; uninstall first.
                </p>
                </body></html>
                """);

        return html.toString();
    }

    private static Instant lastModified(Path path) {
        try {
            return Files.getLastModifiedTime(path).toInstant();
        } catch (IOException e) {
            return Instant.EPOCH;
        }
    }
}
