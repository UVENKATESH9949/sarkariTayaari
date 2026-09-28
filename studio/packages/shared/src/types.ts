/**
 * Minimal, extensible types. The full Lesson/Scene JSON schema (project spec
 * sections 8-9) lands in Milestone 4 once the LLM pipeline exists — for now
 * scenes are authored by hand in apps/studio.
 */
export interface Subtitle {
  text: string;
  /** Start time in seconds, relative to the scene/composition it belongs to. */
  start: number;
  /** End time in seconds. */
  end: number;
}

export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

export interface SceneDefinition {
  id: string;
  type: string;
  durationInSeconds: number;
  narration?: string;
  subtitles?: Subtitle[];
}

/** A single generated narration clip's measured/derived timing data. */
export interface NarrationManifestEntry {
  /** Path relative to the Remotion public dir, suitable for staticFile(). */
  audioRelativePath: string;
  /** Measured duration of the synthesized audio itself, in seconds. */
  durationInSeconds: number;
  /** Silence before narration starts playing, in seconds (visual lead-in). */
  leadInSeconds: number;
  /** Silence after narration ends before the scene cuts, in seconds. */
  tailInSeconds: number;
  /** Linear volume multiplier applied at render time to normalize loudness. */
  gain: number;
  /** Subtitle cues, already offset so they line up with audio playback. */
  subtitles: Subtitle[];
  /** Which TTS provider/voice produced this clip, for traceability. */
  provider: string;
  voice: string;
}

export interface NarrationManifest {
  lessonId: string;
  generatedAt: string;
  scenes: Record<string, NarrationManifestEntry>;
}
