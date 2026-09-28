package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.entity.VideoStatus;
import com.sarkaritaiyaari.backend.repository.LessonVideoRepository;
import com.sarkaritaiyaari.backend.repository.LessonVideoUploadRepository;
import com.sarkaritaiyaari.backend.video.StoredObject;
import com.sarkaritaiyaari.backend.video.StoredVideo;
import com.sarkaritaiyaari.backend.video.VideoStorage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * What happens when the object store refuses the upload.
 *
 * <p>This is the behaviour the publish flow was rebuilt for, and it cannot be provoked with a real
 * store: the local filesystem does not fail on demand, and deliberately breaking real Cloudinary
 * credentials is not a test. So the store is replaced with one that can be told to fail.
 *
 * <p>It has its own Spring context because of that override. That costs a second context start,
 * and it buys the only tests in this suite that prove a failed upload is recorded rather than
 * silently rolled back - which was the actual defect: the upload used to run inside the same
 * transaction as the row write, so a storage failure destroyed the evidence of itself.
 */
@Import(LessonVideoUploadFailureTest.FailableStorageConfig.class)
class LessonVideoUploadFailureTest extends AbstractIntegrationTest {

    @Autowired
    private LessonVideoRepository lessonVideoRepository;

    @Autowired
    private LessonVideoUploadRepository lessonVideoUploadRepository;

    @Autowired
    private FailableVideoStorage storage;

    private final List<UUID> videoIds = new ArrayList<>();

    @AfterEach
    void cleanUpVideos() {
        videoIds.forEach(id -> {
            lessonVideoUploadRepository.deleteById(id);
            lessonVideoRepository.deleteById(id);
        });
        videoIds.clear();
        storage.reset();
    }

    @Test
    @DisplayName("a failed upload is recorded, the video stays unpublished, and the file is kept")
    void failedUploadIsRecordedAndRetryable() {
        UUID videoId = uploadVideo();
        storage.failNextUploads(true);

        ResponseEntity<Map> refused = publish(videoId);

        // A 400, not a 500: nothing is broken, the upload just did not go through, and the admin
        // has something to do about it.
        assertThat(refused.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        var row = lessonVideoRepository.findById(videoId).orElseThrow();
        // The row survived the failure. Under the old code the whole transaction rolled back and
        // this row looked exactly as it had before the attempt.
        assertThat(row.getStatus()).isEqualTo(VideoStatus.UPLOAD_FAILED);
        assertThat(row.getErrorMessage()).isNotBlank();
        assertThat(row.getUploadAttempts()).isEqualTo(1);
        assertThat(row.getLastUploadAttemptAt()).isNotNull();
        // Never published on a failed upload. A PUBLISHED row with no file behind it is what a
        // student meets as a play button that does nothing.
        assertThat(row.getContentStatus().name()).isEqualTo("DRAFT");
        assertThat(row.getStorageKey()).isNull();
        // The only copy of the file is still here, which is what makes a retry possible at all.
        assertThat(lessonVideoUploadRepository.existsById(videoId)).isTrue();
    }

    @Test
    @DisplayName("retrying after a failure uploads the staged file and does not duplicate it")
    void retrySucceedsWithoutDuplicating() {
        UUID videoId = uploadVideo();
        storage.failNextUploads(true);
        publish(videoId);

        storage.failNextUploads(false);
        ResponseEntity<Map> retried = restTemplate.exchange(
                "/api/admin/lesson-videos/" + videoId + "/retry-upload",
                HttpMethod.POST, adminAuth(), Map.class);

        assertThat(retried.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(retried.getBody().get("status")).isEqualTo("READY");
        assertThat(retried.getBody().get("uploadAttempts")).isEqualTo(2);
        assertThat(retried.getBody().get("hasStagedFile")).isEqualTo(false);

        // Exactly one object exists for this video. The failed attempt and the successful one
        // used the same derived key, so a retry replaces rather than adding a second copy - the
        // duplicate-upload risk the retry button would otherwise introduce.
        assertThat(storage.distinctKeys()).containsExactly(
                "lesson-videos/" + videoId + "/v1.mp4");
        assertThat(storage.uploadCount()).isEqualTo(2);

        // Retry only moves the file. Deciding the content is good is still a separate step, so
        // the video is not live yet.
        assertThat(retried.getBody().get("contentStatus")).isEqualTo("DRAFT");
    }

    @Test
    @DisplayName("retrying a video whose file is already stored does not upload it again")
    void retryOnAStoredVideoIsANoOp() {
        UUID videoId = uploadVideo();
        publish(videoId);
        int afterPublish = storage.uploadCount();

        ResponseEntity<Map> retried = restTemplate.exchange(
                "/api/admin/lesson-videos/" + videoId + "/retry-upload",
                HttpMethod.POST, adminAuth(), Map.class);

        assertThat(retried.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(storage.uploadCount()).isEqualTo(afterPublish);
    }

    private UUID uploadVideo() {
        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("file", new ByteArrayResource(fakeMp4()) {
            @Override
            public String getFilename() {
                return "lesson.mp4";
            }
        });
        form.add("topicId", testTopicId.toString());
        form.add("language", "en");

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        headers.set(HttpHeaders.AUTHORIZATION, adminAuth().getHeaders().getFirst(HttpHeaders.AUTHORIZATION));

        ResponseEntity<Map> created = restTemplate.postForEntity("/api/admin/lesson-videos",
                new HttpEntity<>(form, headers), Map.class);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.OK);
        UUID id = UUID.fromString((String) created.getBody().get("id"));
        videoIds.add(id);
        return id;
    }

    private ResponseEntity<Map> publish(UUID videoId) {
        return restTemplate.exchange("/api/admin/lesson-videos/" + videoId + "/publish",
                HttpMethod.PUT, adminAuth(), Map.class);
    }

    /** Minimal valid MP4 header: an ftyp box marker at offset 4, which is what the service checks. */
    private static byte[] fakeMp4() {
        byte[] bytes = new byte[64];
        bytes[4] = 0x66;
        bytes[5] = 0x74;
        bytes[6] = 0x79;
        bytes[7] = 0x70;
        return bytes;
    }

    @TestConfiguration
    static class FailableStorageConfig {
        @Bean
        @Primary
        FailableVideoStorage failableVideoStorage() {
            return new FailableVideoStorage();
        }
    }

    /**
     * An in-memory store that can be told to fail, and that counts what it was asked to do.
     *
     * <p>Counting uploads separately from distinct keys is the point: "was this uploaded twice"
     * and "did it leave two copies behind" are different questions, and the retry guarantee is
     * about the second one.
     */
    static class FailableVideoStorage implements VideoStorage {

        private final AtomicBoolean failing = new AtomicBoolean(false);
        private final AtomicInteger uploads = new AtomicInteger();
        private final Map<String, byte[]> objects = new java.util.concurrent.ConcurrentHashMap<>();

        void failNextUploads(boolean fail) {
            failing.set(fail);
        }

        void reset() {
            failing.set(false);
            uploads.set(0);
            objects.clear();
        }

        int uploadCount() {
            return uploads.get();
        }

        List<String> distinctKeys() {
            return objects.keySet().stream().sorted().toList();
        }

        @Override
        public StoredObject store(String key, byte[] bytes, String mimeType) {
            uploads.incrementAndGet();
            if (failing.get()) {
                throw new IllegalStateException("storage refused the upload");
            }
            objects.put(key, bytes);
            return StoredObject.of(key);
        }

        @Override
        public Optional<StoredVideo> open(String key) {
            return Optional.ofNullable(objects.get(key))
                    .map(b -> new StoredVideo(new ByteArrayResource(b), b.length, "video/mp4"));
        }

        @Override
        public Optional<URI> deliveryUrl(String key) {
            return Optional.empty();
        }

        @Override
        public void delete(String key) {
            objects.remove(key);
        }
    }
}
