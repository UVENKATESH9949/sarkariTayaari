package com.sarkaritaiyaari.backend.video;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Checks that a blueprint payload really is a studio Lesson document.
 *
 * <p>The authoritative schema is a zod contract in the AI Video Studio repository
 * ({@code packages/lesson-engine/src/schema.ts}). This is a deliberately partial mirror: it
 * enforces the structure the main app actually depends on - the identity fields it indexes and
 * displays, and the scene vocabulary it would have to render - and does not attempt to re-check
 * every per-scene field. Duplicating the full zod schema in Java would create a second contract
 * that silently disagrees with the first the next time a scene type gains a field.
 *
 * <p>The division of responsibility: the studio validates deeply and refuses to render a bad
 * lesson; this validates shallowly and refuses to STORE something that is not a lesson at all.
 * Storing an arbitrary JSON blob under a column called {@code payload} is how a table stops
 * meaning anything.
 */
public final class LessonBlueprintValidation {

    /** The shape this Java-side check was written against. */
    public static final String SCHEMA_VERSION = "STUDIO_LESSON_V1";

    /** The discriminated-union tags in the studio schema, in narrative order. */
    private static final Set<String> SCENE_TYPES =
            Set.of("title", "concept", "example", "formula", "summary");

    private static final List<String> REQUIRED_TOP_LEVEL =
            List.of("id", "title", "exam", "subject", "topic", "scenes");

    private LessonBlueprintValidation() {
    }

    /**
     * @return an empty list when the payload is acceptable, otherwise one message per problem.
     *         Every problem is reported rather than only the first, so an admin fixing an import
     *         sees the whole list instead of discovering issues one save at a time.
     */
    public static List<String> problems(Map<String, Object> payload) {
        List<String> problems = new ArrayList<>();
        if (payload == null || payload.isEmpty()) {
            problems.add("Lesson payload is empty.");
            return problems;
        }

        for (String field : REQUIRED_TOP_LEVEL) {
            Object value = payload.get(field);
            if (value == null || (value instanceof String s && s.isBlank())) {
                problems.add("Lesson is missing a value for \"" + field + "\".");
            }
        }

        Object scenes = payload.get("scenes");
        if (scenes == null) {
            return problems;
        }
        if (!(scenes instanceof List<?> sceneList)) {
            problems.add("Lesson \"scenes\" must be a list.");
            return problems;
        }
        if (sceneList.isEmpty()) {
            problems.add("Lesson \"scenes\" must contain at least one scene.");
            return problems;
        }

        for (int i = 0; i < sceneList.size(); i++) {
            String where = "Scene " + (i + 1);
            if (!(sceneList.get(i) instanceof Map<?, ?> scene)) {
                problems.add(where + " is not an object.");
                continue;
            }
            Object type = scene.get("type");
            if (!(type instanceof String typeName) || !SCENE_TYPES.contains(typeName)) {
                problems.add(where + " has an unknown type " + describe(type)
                        + ". Expected one of " + SCENE_TYPES + ".");
            }
            if (!(scene.get("id") instanceof String sceneId) || sceneId.isBlank()) {
                problems.add(where + " is missing an \"id\".");
            }
            // Narration is what the duration is measured from, so a scene without it cannot be
            // timed at all - this is the one per-scene field worth checking here.
            if (!(scene.get("narration") instanceof String narration) || narration.isBlank()) {
                problems.add(where + " is missing \"narration\".");
            }
        }
        return problems;
    }

    /** Number of scenes, for display. Returns 0 for anything unparseable. */
    public static int sceneCount(Map<String, Object> payload) {
        if (payload != null && payload.get("scenes") instanceof List<?> scenes) {
            return scenes.size();
        }
        return 0;
    }

    /** The studio's own lesson id, when present. */
    public static String studioLessonId(Map<String, Object> payload) {
        if (payload != null && payload.get("id") instanceof String id && !id.isBlank()) {
            return id;
        }
        return null;
    }

    private static String describe(Object value) {
        return value == null ? "(missing)" : "\"" + value + "\"";
    }
}
