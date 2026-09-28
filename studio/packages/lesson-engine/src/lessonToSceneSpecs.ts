import type { ReactNode } from "react";
import type { Subtitle } from "@sarkaritaayari/shared";
import type { LessonSceneSpec } from "@sarkaritaayari/scene-engine";
import type { Lesson } from "./schema";
import { renderScene } from "./renderScene";

/** Bridges validated Lesson JSON into the scene-engine's rendering pipeline. */
export function lessonToSceneSpecs(lesson: Lesson, fps: number): LessonSceneSpec[] {
  return lesson.scenes.map((scene) => ({
    id: scene.id,
    buildContent: (subtitles: Subtitle[], durationInFrames: number): ReactNode =>
      renderScene(scene, subtitles, durationInFrames, fps),
  }));
}
