import { parseFile } from "music-metadata";

/** Reads duration straight from the audio file's own metadata — no ffmpeg needed. */
export async function getAudioDuration(filePath: string): Promise<number> {
  const metadata = await parseFile(filePath);
  const duration = metadata.format.duration;
  if (duration === undefined) {
    throw new Error(`Could not determine duration of audio file: ${filePath}`);
  }
  return duration;
}
