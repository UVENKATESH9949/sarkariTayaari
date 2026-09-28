import type { WordTiming } from "@sarkaritaayari/shared";

export type { WordTiming };

export interface TTSRequest {
  text: string;
  /** Provider-specific voice identifier. Each provider documents its own defaults. */
  voice?: string;
  /** BCP-47-ish language hint, e.g. "en". Not all providers need this. */
  language?: string;
  /** Playback speed multiplier. 1.0 = natural pace. */
  speed?: number;
}

export interface TTSResult {
  /** Absolute path to the synthesized audio file on disk. */
  audioFilePath: string;
  durationInSeconds: number;
  /** Only populated by providers that expose word-level alignment (most don't). */
  wordTimings?: WordTiming[];
}

/**
 * Provider-independent narration interface. Concrete providers (cloud API,
 * local engine) live under ./providers and are swapped without touching
 * anything that calls synthesize().
 */
export interface TTSProvider {
  readonly name: string;
  synthesize(request: TTSRequest, outputPath: string): Promise<TTSResult>;
}
