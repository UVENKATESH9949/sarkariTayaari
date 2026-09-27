package com.sarkaritaiyaari.backend;

import com.sarkaritaiyaari.backend.entitlement.Capability;
import com.sarkaritaiyaari.backend.entitlement.EntitlementService;
import com.sarkaritaiyaari.backend.entity.Role;
import com.sarkaritaiyaari.backend.entity.User;
import com.sarkaritaiyaari.backend.video.CloudinaryVideoStorage;
import com.sarkaritaiyaari.backend.video.LessonBlueprintValidation;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Rules that need no Spring context and no database.
 *
 * <p>Written deliberately as a plain JUnit test, following the precedent this project set with
 * TaskOutcomeRuleTest and TopicHealthScoringTest: these are decisions about constructed inputs,
 * and asserting them against a shared dev database would make the assertions depend on whatever
 * data happens to be there. It also runs in milliseconds, so the rules are proven before a
 * 20-minute integration run is started.
 */
class LessonVideoRulesTest {

    private static Map<String, Object> validLesson() {
        return Map.of(
                "id", "profit-and-loss",
                "title", "Profit and Loss",
                "exam", "SSC CGL",
                "subject", "Quantitative Aptitude",
                "topic", "Profit and Loss",
                "language", "en",
                "scenes", List.of(
                        Map.of("type", "title", "id", "s1", "narration", "Welcome."),
                        Map.of("type", "concept", "id", "s2", "narration", "Cost price is."),
                        Map.of("type", "summary", "id", "s3", "narration", "To recap.")));
    }

    @Test
    @DisplayName("a real studio lesson is accepted")
    void acceptsAStudioLesson() {
        assertThat(LessonBlueprintValidation.problems(validLesson())).isEmpty();
        assertThat(LessonBlueprintValidation.sceneCount(validLesson())).isEqualTo(3);
        assertThat(LessonBlueprintValidation.studioLessonId(validLesson())).isEqualTo("profit-and-loss");
    }

    @Test
    @DisplayName("an empty payload is rejected rather than stored as a lesson")
    void rejectsEmptyPayload() {
        assertThat(LessonBlueprintValidation.problems(Map.of())).isNotEmpty();
        assertThat(LessonBlueprintValidation.problems(null)).isNotEmpty();
    }

    @Test
    @DisplayName("a scene type outside the studio vocabulary is rejected")
    void rejectsUnknownSceneType() {
        Map<String, Object> lesson = new java.util.HashMap<>(validLesson());
        lesson.put("scenes", List.of(Map.of("type", "interpretive-dance", "id", "s1", "narration", "x")));

        List<String> problems = LessonBlueprintValidation.problems(lesson);

        assertThat(problems).anyMatch(p -> p.contains("unknown type"));
    }

    @Test
    @DisplayName("a scene without narration is rejected, because duration is measured from it")
    void rejectsSceneWithoutNarration() {
        Map<String, Object> lesson = new java.util.HashMap<>(validLesson());
        lesson.put("scenes", List.of(Map.of("type", "title", "id", "s1")));

        assertThat(LessonBlueprintValidation.problems(lesson))
                .anyMatch(p -> p.contains("narration"));
    }

    @Test
    @DisplayName("every problem is reported at once, not just the first")
    void reportsEveryProblem() {
        Map<String, Object> lesson = Map.of("scenes", List.of(Map.of("type", "nope", "id", "")));

        List<String> problems = LessonBlueprintValidation.problems(lesson);

        // Missing id/title/exam/subject/topic, plus the bad scene type and blank scene id.
        assertThat(problems.size()).isGreaterThan(3);
    }

    @Test
    @DisplayName("an empty scene list is rejected")
    void rejectsEmptyScenes() {
        Map<String, Object> lesson = new java.util.HashMap<>(validLesson());
        lesson.put("scenes", List.of());

        assertThat(LessonBlueprintValidation.problems(lesson))
                .anyMatch(p -> p.contains("at least one scene"));
    }

    @Test
    @DisplayName("video is open to everyone when the deployment has not gated it")
    void ungatedDeploymentGrantsEveryone() {
        EntitlementService entitlements = new EntitlementService(true);

        assertThat(entitlements.has(student(), Capability.AI_VIDEO)).isTrue();
        assertThat(entitlements.isAiVideoGated()).isFalse();
    }

    @Test
    @DisplayName("a gated deployment refuses a student but still allows staff to review")
    void gatedDeploymentStillAllowsStaff() {
        EntitlementService entitlements = new EntitlementService(false);

        assertThat(entitlements.has(student(), Capability.AI_VIDEO)).isFalse();
        assertThat(entitlements.has(withRole(Role.ADMIN), Capability.AI_VIDEO)).isTrue();
        assertThat(entitlements.has(withRole(Role.REVIEWER), Capability.AI_VIDEO)).isTrue();
        assertThat(entitlements.isAiVideoGated()).isTrue();
    }

    @Test
    @DisplayName("a missing user never holds a capability")
    void nullUserHoldsNothing() {
        assertThat(new EntitlementService(true).has(null, Capability.AI_VIDEO)).isFalse();
    }

    @Test
    @DisplayName("a storage key maps to a Cloudinary public id by dropping the extension")
    void publicIdDropsTheExtension() {
        // Cloudinary carries the format as a separate parameter, so a public id ending in .mp4
        // would produce an asset actually named "...mp4.mp4".
        assertThat(CloudinaryVideoStorage.publicIdFor("lesson-videos/abc/v1.mp4"))
                .isEqualTo("lesson-videos/abc/v1");
    }

    @Test
    @DisplayName("a key with no extension is used as the public id unchanged")
    void publicIdLeavesAnExtensionlessKeyAlone() {
        assertThat(CloudinaryVideoStorage.publicIdFor("lesson-videos/abc/v1"))
                .isEqualTo("lesson-videos/abc/v1");
    }

    @Test
    @DisplayName("the public id is derived from the key, so the row and the asset cannot drift")
    void publicIdIsDerivedNotStored() {
        // Two versions of the same video must not collide on one asset - this is what makes a
        // re-upload a genuinely separate file rather than an overwrite.
        assertThat(CloudinaryVideoStorage.publicIdFor("lesson-videos/abc/v1.mp4"))
                .isNotEqualTo(CloudinaryVideoStorage.publicIdFor("lesson-videos/abc/v2.mp4"));
    }

    @Test
    @DisplayName("a blank storage key is refused rather than becoming a public id")
    void publicIdRefusesBlank() {
        assertThatThrownBy(() -> CloudinaryVideoStorage.publicIdFor("  "))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> CloudinaryVideoStorage.publicIdFor(null))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static User student() {
        return withRole(Role.STUDENT);
    }

    private static User withRole(Role role) {
        User user = new User();
        user.setEmail("rules-test@example.com");
        user.setRole(role);
        return user;
    }
}
