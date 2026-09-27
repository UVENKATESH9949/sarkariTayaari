package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.repository.LessonBlueprintRepository;
import com.sarkaritaiyaari.backend.repository.LessonVideoRepository;
import com.sarkaritaiyaari.backend.video.VideoStorage;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * End-to-end behaviour of the lesson-video foundation against the real dev database.
 *
 * <p>The uploaded bytes are a synthetic MP4 header rather than a real rendered video - the same
 * approach PdfTextExtractorTest already takes for PDFs, and for the same reason: committing a
 * multi-megabyte binary to the repository to exercise a magic-byte check is a poor trade. What
 * this proves is the contract - validation, versioning, review gating, entitlement, and the
 * question-to-topic fallback - not that a particular file decodes.
 */
class LessonVideoTest extends AbstractIntegrationTest {

    @Autowired
    private LessonVideoRepository lessonVideoRepository;

    @Autowired
    private LessonBlueprintRepository lessonBlueprintRepository;

    @Autowired
    private VideoStorage videoStorage;

    private static byte[] fakeMp4() {
        return new byte[] {
                0, 0, 0, 0x20, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm',
                0, 0, 0, 0, 'm', 'd', 'a', 't'
        };
    }

    @AfterEach
    void cleanUpLessonRows() {
        // Delete the stored bytes too, not just the rows. Deleting only the rows leaks a file per
        // uploading test on every run, which on the local-filesystem store is real clutter that
        // nothing would ever reclaim.
        lessonVideoRepository.findAll().stream()
                .filter(v -> testTopicId.equals(v.getTopicId()))
                .forEach(v -> {
                    if (v.getStorageKey() != null) {
                        videoStorage.delete(v.getStorageKey());
                    }
                    lessonVideoRepository.delete(v);
                });
        lessonBlueprintRepository.findAll().stream()
                .filter(b -> testTopicId.equals(b.getTopicId()))
                .forEach(lessonBlueprintRepository::delete);
    }

    private String tokenOf(HttpEntity<?> auth) {
        return auth.getHeaders().getFirst(HttpHeaders.AUTHORIZATION);
    }

    private ResponseEntity<Map> upload(String authHeader, UUID topicId, UUID questionId,
                                       boolean premium, byte[] bytes) {
        MultiValueMap<String, Object> form = new LinkedMultiValueMap<>();
        form.add("file", new ByteArrayResource(bytes) {
            @Override
            public String getFilename() {
                return "lesson.mp4";
            }
        });
        if (topicId != null) {
            form.add("topicId", topicId.toString());
        }
        if (questionId != null) {
            form.add("questionId", questionId.toString());
        }
        form.add("language", "en");
        form.add("durationSeconds", "126");
        form.add("premium", String.valueOf(premium));

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.MULTIPART_FORM_DATA);
        headers.set(HttpHeaders.AUTHORIZATION, authHeader);
        return restTemplate.postForEntity("/api/admin/lesson-videos",
                new HttpEntity<>(form, headers), Map.class);
    }

    private ResponseEntity<Map> publish(UUID videoId) {
        return restTemplate.exchange("/api/admin/lesson-videos/" + videoId + "/publish",
                HttpMethod.PUT, adminAuth(), Map.class);
    }

    private ResponseEntity<Map> topicAvailability(HttpEntity<?> auth) {
        return restTemplate.exchange("/api/topics/" + testTopicId + "/lesson-video?language=en",
                HttpMethod.GET, auth, Map.class);
    }

    @Test
    @DisplayName("an uploaded video is READY but not yet visible to a student until published")
    void uploadIsReadyButUnpublished() {
        ResponseEntity<Map> created = upload(tokenOf(adminAuth()), testTopicId, null, false, fakeMp4());
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(created.getBody().get("status")).isEqualTo("READY");
        assertThat(created.getBody().get("contentStatus")).isEqualTo("DRAFT");
        assertThat(created.getBody().get("contentVersion")).isEqualTo(1);
        assertThat(created.getBody().get("checksumSha256")).isNotNull();

        // The student-facing read must not see it yet. This is the check that stops a video
        // reaching learners the moment it is uploaded, before anyone has watched it.
        ResponseEntity<Map> before = topicAvailability(sharedStudentAuth());
        assertThat(before.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(before.getBody().get("available")).isEqualTo(false);
    }

    @Test
    @DisplayName("publishing makes it available, and unpublishing takes it away again")
    void publishThenUnpublish() {
        UUID videoId = UUID.fromString((String) upload(tokenOf(adminAuth()), testTopicId, null, false, fakeMp4())
                .getBody().get("id"));

        assertThat(publish(videoId).getStatusCode()).isEqualTo(HttpStatus.OK);

        ResponseEntity<Map> available = topicAvailability(sharedStudentAuth());
        assertThat(available.getBody().get("available")).isEqualTo(true);
        assertThat(available.getBody().get("resolvedVia")).isEqualTo("TOPIC");
        assertThat(available.getBody().get("durationSeconds")).isEqualTo(126);
        assertThat((String) available.getBody().get("playbackPath"))
                .isEqualTo("/api/lesson-videos/" + videoId + "/stream");

        restTemplate.exchange("/api/admin/lesson-videos/" + videoId + "/unpublish",
                HttpMethod.PUT, adminAuth(), Map.class);

        assertThat(topicAvailability(sharedStudentAuth()).getBody().get("available")).isEqualTo(false);
    }

    @Test
    @DisplayName("a published video streams its bytes to a signed-in student")
    void publishedVideoStreams() {
        UUID videoId = UUID.fromString((String) upload(tokenOf(adminAuth()), testTopicId, null, false, fakeMp4())
                .getBody().get("id"));
        publish(videoId);

        ResponseEntity<byte[]> streamed = restTemplate.exchange(
                "/api/lesson-videos/" + videoId + "/stream",
                HttpMethod.GET, sharedStudentAuth(), byte[].class);

        assertThat(streamed.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(streamed.getBody()).isEqualTo(fakeMp4());
        assertThat(streamed.getHeaders().getFirst(HttpHeaders.ACCEPT_RANGES)).isEqualTo("bytes");
    }

    @Test
    @DisplayName("an unpublished video is 404 to a student, not 403 - ids must not be probeable")
    void unpublishedVideoIsNotFoundForStudents() {
        UUID videoId = UUID.fromString((String) upload(tokenOf(adminAuth()), testTopicId, null, false, fakeMp4())
                .getBody().get("id"));

        ResponseEntity<Map> streamed = restTemplate.exchange(
                "/api/lesson-videos/" + videoId + "/stream",
                HttpMethod.GET, sharedStudentAuth(), Map.class);

        assertThat(streamed.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    @DisplayName("staff can preview an unpublished video so it can be reviewed before release")
    void staffCanPreviewUnpublished() {
        UUID videoId = UUID.fromString((String) upload(tokenOf(adminAuth()), testTopicId, null, false, fakeMp4())
                .getBody().get("id"));

        ResponseEntity<byte[]> streamed = restTemplate.exchange(
                "/api/lesson-videos/" + videoId + "/stream",
                HttpMethod.GET, reviewerAuth(), byte[].class);

        assertThat(streamed.getStatusCode()).isEqualTo(HttpStatus.OK);
    }

    @Test
    @DisplayName("a question with no video of its own resolves to its topic lesson")
    void questionFallsBackToTopicLesson() {
        UUID videoId = UUID.fromString((String) upload(tokenOf(adminAuth()), testTopicId, null, false, fakeMp4())
                .getBody().get("id"));
        publish(videoId);

        UUID questionId = createQuestionOnTestTopic();

        ResponseEntity<Map> resolved = restTemplate.exchange(
                "/api/questions/" + questionId + "/lesson-video?language=en",
                HttpMethod.GET, sharedStudentAuth(), Map.class);

        assertThat(resolved.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(resolved.getBody().get("available")).isEqualTo(true);
        // The caller must be able to tell this was the topic lesson, not one made for this
        // question - otherwise the app would claim a tailored explanation it does not have.
        assertThat(resolved.getBody().get("resolvedVia")).isEqualTo("TOPIC");
        assertThat(resolved.getBody().get("videoId")).isEqualTo(videoId.toString());
    }

    @Test
    @DisplayName("re-uploading for the same owner creates a new version rather than overwriting")
    void reuploadBumpsContentVersion() {
        upload(tokenOf(adminAuth()), testTopicId, null, false, fakeMp4());
        ResponseEntity<Map> second = upload(tokenOf(adminAuth()), testTopicId, null, false, fakeMp4());

        assertThat(second.getBody().get("contentVersion")).isEqualTo(2);
    }

    @Test
    @DisplayName("a non-MP4 upload is rejected on its bytes, not on its declared type")
    void rejectsNonMp4() {
        byte[] notAVideo = "this is plainly not a video file at all".getBytes();

        ResponseEntity<Map> response = upload(tokenOf(adminAuth()), testTopicId, null, false, notAVideo);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    @DisplayName("a video must belong to exactly one of a topic or a question")
    void rejectsBothOwners() {
        UUID questionId = createQuestionOnTestTopic();

        ResponseEntity<Map> both = upload(tokenOf(adminAuth()), testTopicId, questionId, false, fakeMp4());
        assertThat(both.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);

        ResponseEntity<Map> neither = upload(tokenOf(adminAuth()), null, null, false, fakeMp4());
        assertThat(neither.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    @DisplayName("a student cannot upload a video, and an anonymous caller cannot read one")
    void authorisationIsEnforced() {
        ResponseEntity<Map> asStudent =
                upload(tokenOf(sharedStudentAuth()), testTopicId, null, false, fakeMp4());
        assertThat(asStudent.getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN);

        ResponseEntity<Map> anonymous = restTemplate.getForEntity(
                "/api/topics/" + testTopicId + "/lesson-video", Map.class);
        assertThat(anonymous.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED);
    }

    @Test
    @DisplayName("asking about a topic that does not exist is a 404")
    void unknownTopicIs404() {
        ResponseEntity<Map> response = restTemplate.exchange(
                "/api/topics/" + UUID.randomUUID() + "/lesson-video",
                HttpMethod.GET, sharedStudentAuth(), Map.class);

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.NOT_FOUND);
    }

    @Test
    @DisplayName("a topic with no video reports unavailable rather than failing")
    void noVideoIsAnAnswerNotAnError() {
        ResponseEntity<Map> response = topicAvailability(sharedStudentAuth());

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(response.getBody().get("available")).isEqualTo(false);
        assertThat(response.getBody().get("videoId")).isNull();
    }

    @Test
    @DisplayName("a studio lesson JSON is stored as a blueprint and a bad one is refused")
    void blueprintRoundTrip() {
        Map<String, Object> lesson = Map.of(
                "id", "profit-and-loss",
                "title", "Profit and Loss",
                "exam", "SSC CGL",
                "subject", "Quantitative Aptitude",
                "topic", "Profit and Loss",
                "language", "en",
                "scenes", java.util.List.of(
                        Map.of("type", "title", "id", "s1", "narration", "Welcome."),
                        Map.of("type", "summary", "id", "s2", "narration", "To recap.")));

        ResponseEntity<Map> created = restTemplate.exchange(
                "/api/admin/lesson-blueprints", HttpMethod.POST,
                adminAuth(Map.of("topicId", testTopicId.toString(), "language", "en",
                        "source", "IMPORTED", "payload", lesson)),
                Map.class);

        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.OK);
        assertThat(created.getBody().get("studioLessonId")).isEqualTo("profit-and-loss");
        assertThat(created.getBody().get("schemaVersion")).isEqualTo("STUDIO_LESSON_V1");
        assertThat(created.getBody().get("contentStatus")).isEqualTo("DRAFT");

        ResponseEntity<Map> rejected = restTemplate.exchange(
                "/api/admin/lesson-blueprints", HttpMethod.POST,
                adminAuth(Map.of("topicId", testTopicId.toString(), "language", "en",
                        "payload", Map.of("id", "broken"))),
                Map.class);

        assertThat(rejected.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    @Test
    @DisplayName("deleting a video removes it from the student-facing read")
    void deleteRemovesVideo() {
        UUID videoId = UUID.fromString((String) upload(tokenOf(adminAuth()), testTopicId, null, false, fakeMp4())
                .getBody().get("id"));
        publish(videoId);
        assertThat(topicAvailability(sharedStudentAuth()).getBody().get("available")).isEqualTo(true);

        restTemplate.exchange("/api/admin/lesson-videos/" + videoId,
                HttpMethod.DELETE, adminAuth(), Void.class);

        assertThat(topicAvailability(sharedStudentAuth()).getBody().get("available")).isEqualTo(false);
    }

    private UUID createQuestionOnTestTopic() {
        ResponseEntity<Map> created = restTemplate.exchange(
                "/api/questions", HttpMethod.POST, adminAuth(sampleRequest()), Map.class);
        assertThat(created.getStatusCode()).isEqualTo(HttpStatus.CREATED);
        UUID id = UUID.fromString((String) created.getBody().get("id"));
        createdIds.add(id);
        return id;
    }
}
