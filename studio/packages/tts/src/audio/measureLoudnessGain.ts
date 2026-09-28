import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const DEFAULT_TARGET_LUFS = -16;
const MIN_GAIN = 0.4;
const MAX_GAIN = 2.5;

/**
 * Measures a clip's integrated loudness via ffmpeg's loudnorm filter (single
 * analysis pass, no re-encoding) and returns a linear gain multiplier that
 * would bring it to `targetLufs`. Applied at render time via the Remotion
 * <Audio volume={gain}> prop, so narration stays perceptually consistent
 * across scenes without needing to re-encode every clip.
 */
export function measureLoudnessGain(filePath: string, targetLufs: number = DEFAULT_TARGET_LUFS): Promise<number> {
  const ffmpegBinary = ffmpegPath;
  if (!ffmpegBinary) {
    throw new Error("ffmpeg-static did not resolve a binary path for this platform.");
  }

  return new Promise((resolve, reject) => {
    const args = [
      "-i",
      filePath,
      "-af",
      `loudnorm=I=${targetLufs}:TP=-1.5:LRA=11:print_format=json`,
      "-f",
      "null",
      "-",
    ];

    const proc = spawn(ffmpegBinary, args);
    let stderr = "";
    proc.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    proc.on("error", reject);
    proc.on("close", () => {
      const match = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/);
      if (!match) {
        // Measurement failed (e.g. near-silent clip) — fall back to unity gain
        // rather than failing the whole synthesis run over one scene.
        resolve(1);
        return;
      }

      try {
        const stats = JSON.parse(match[0]);
        const measuredLufs = parseFloat(stats.input_i);
        if (!Number.isFinite(measuredLufs)) {
          resolve(1);
          return;
        }
        const gainDb = targetLufs - measuredLufs;
        const linearGain = Math.pow(10, gainDb / 20);
        resolve(Math.min(MAX_GAIN, Math.max(MIN_GAIN, linearGain)));
      } catch {
        resolve(1);
      }
    });
  });
}
