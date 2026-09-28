import type { ReactNode } from "react";
import { staticFile } from "remotion";
import type { NarrationManifest, Subtitle } from "@sarkaritaayari/shared";
import type { SequenceScene } from "./SceneSequence";

export interface LessonSceneSpec {
  id: string;
  /**
   * Receives the subtitles generated from this scene's actual narration
   * audio, plus the scene's final computed duration in frames (lead-in +
   * narration + tail). Passing duration lets content authors place visual
   * beats proportionally (e.g. "reveal at 40% through") instead of guessing
   * fixed frame numbers that would only fit one specific narration length.
   */
  buildContent: (subtitles: Subtitle[], durationInFrames: number) => ReactNode;
}

/**
 * Turns a lesson's content specs + its generated narration manifest into the
 * SequenceScene[] that <SceneSequence> renders. This is where "duration
 * follows narration" actually happens: each scene's frame count comes from
 * the measured audio length (plus configured padding), not a guessed
 * constant, and the matching audio clip is wired up automatically.
 */
export function buildLessonScenes(
  sceneSpecs: LessonSceneSpec[],
  manifest: NarrationManifest,
  fps: number
): SequenceScene[] {
  return sceneSpecs.map((spec) => {
    const entry = manifest.scenes[spec.id];
    if (!entry) {
      throw new Error(
        `No narration manifest entry for scene "${spec.id}" in lesson "${manifest.lessonId}". Run the narration synthesis script first.`
      );
    }

    const durationInFrames = Math.ceil((entry.leadInSeconds + entry.durationInSeconds + entry.tailInSeconds) * fps);
    const startFrame = Math.round(entry.leadInSeconds * fps);

    return {
      durationInFrames,
      content: spec.buildContent(entry.subtitles, durationInFrames),
      audio: {
        src: staticFile(entry.audioRelativePath),
        volume: entry.gain,
        startFrame,
      },
    };
  });
}
