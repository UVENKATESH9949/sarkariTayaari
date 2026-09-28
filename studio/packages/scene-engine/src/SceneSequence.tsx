import React from "react";
import { AbsoluteFill, Audio, Sequence } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";

export interface SequenceSceneAudio {
  /** Source for Remotion's <Audio> — typically a staticFile() URL. */
  src: string;
  /** Linear volume multiplier (use this for loudness normalization gain). */
  volume?: number;
  /** Local frame at which playback starts, e.g. a lead-in silence before narration. */
  startFrame?: number;
}

export interface SequenceScene {
  durationInFrames: number;
  content: React.ReactNode;
  /** Per-scene narration audio. Omit for a silent scene. */
  audio?: SequenceSceneAudio;
}

export interface BackgroundMusicSpec {
  src: string;
  /** Keep this low — background music must never compete with narration. */
  volume?: number;
}

const DEFAULT_TRANSITION_FRAMES = 15;
const DEFAULT_BACKGROUND_MUSIC_VOLUME = 0.06;

/**
 * Stitches a list of scenes into a crossfaded TransitionSeries and attaches
 * each scene's narration audio at the right offset. Every lesson composition
 * uses this instead of hand-rolling TransitionSeries wiring, so a new lesson
 * is just data (which scenes, what content, what narration) rather than a
 * repeat of sequencing/transition/audio code.
 */
export const SceneSequence: React.FC<{
  scenes: SequenceScene[];
  transitionFrames?: number;
  /** Optional, subtle, looping background bed under the whole lesson. Off by default. */
  backgroundMusic?: BackgroundMusicSpec;
}> = ({ scenes, transitionFrames = DEFAULT_TRANSITION_FRAMES, backgroundMusic }) => {
  const series = (
    <TransitionSeries>
      {scenes.flatMap((scene, i) => {
        const sequence = (
          <TransitionSeries.Sequence key={`scene-${i}`} durationInFrames={scene.durationInFrames}>
            {scene.content}
            {scene.audio ? (
              <Sequence from={scene.audio.startFrame ?? 0} layout="none">
                <Audio src={scene.audio.src} volume={scene.audio.volume ?? 1} />
              </Sequence>
            ) : null}
          </TransitionSeries.Sequence>
        );

        if (i === scenes.length - 1) {
          return [sequence];
        }

        const transition = (
          <TransitionSeries.Transition
            key={`transition-${i}`}
            presentation={fade()}
            timing={linearTiming({ durationInFrames: transitionFrames })}
          />
        );

        return [sequence, transition];
      })}
    </TransitionSeries>
  );

  if (!backgroundMusic) {
    return series;
  }

  return (
    <AbsoluteFill>
      {series}
      <Audio src={backgroundMusic.src} volume={backgroundMusic.volume ?? DEFAULT_BACKGROUND_MUSIC_VOLUME} loop />
    </AbsoluteFill>
  );
};

/** Total composition duration for a scene list, accounting for crossfade overlap. */
export const computeSequenceDuration = (
  scenes: SequenceScene[],
  transitionFrames: number = DEFAULT_TRANSITION_FRAMES
): number => {
  const sum = scenes.reduce((total, scene) => total + scene.durationInFrames, 0);
  return sum - transitionFrames * Math.max(scenes.length - 1, 0);
};
