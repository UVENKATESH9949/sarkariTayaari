import "dotenv/config";
import path from "node:path";
import { mkdir, rm, readFile, writeFile } from "node:fs/promises";
import { OpenAITTSProvider, LocalSapiTTSProvider, measureLoudnessGain } from "@sarkaritaayari/tts";
import type { TTSProvider } from "@sarkaritaayari/tts";
import { generateSubtitles } from "@sarkaritaayari/subtitle-engine";
import { validateLesson } from "@sarkaritaayari/lesson-engine";
import type { NarrationManifest } from "@sarkaritaayari/shared";

const DEFAULT_LEAD_IN_SECONDS = 0.35;
const DEFAULT_TAIL_SECONDS = 0.6;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}. Add it to a .env file at the repo root.`);
  }
  return value;
}

function createProvider(providerName: string): { provider: TTSProvider; fileExtension: string } {
  if (providerName === "local") {
    return { provider: new LocalSapiTTSProvider(), fileExtension: "wav" };
  }
  if (providerName === "openai") {
    return {
      provider: new OpenAITTSProvider({ apiKey: requireEnv("OPENAI_API_KEY") }),
      fileExtension: "mp3",
    };
  }
  throw new Error(`Unknown provider "${providerName}". Use "openai" or "local".`);
}

async function main() {
  const [, , lessonJsonArg, providerArg] = process.argv;
  if (!lessonJsonArg) {
    console.error("Usage: tsx scripts/synthesize-narration.ts <path-to-lesson.json> [openai|local]");
    process.exit(1);
  }

  const providerName = providerArg ?? "openai";
  const { provider, fileExtension } = createProvider(providerName);

  const lessonJsonPath = path.resolve(process.cwd(), lessonJsonArg);
  const raw = JSON.parse(await readFile(lessonJsonPath, "utf8"));
  const lesson = validateLesson(raw);

  console.log(`Synthesizing narration for "${lesson.id}" with provider "${provider.name}"...\n`);

  const outputDir = path.resolve(process.cwd(), "apps/studio/public/audio", lesson.id);
  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  const manifest: NarrationManifest = {
    lessonId: lesson.id,
    generatedAt: new Date().toISOString(),
    scenes: {},
  };

  for (const scene of lesson.scenes) {
    process.stdout.write(`  ${scene.id} ... `);
    const outputPath = path.join(outputDir, `${scene.id}.${fileExtension}`);
    const result = await provider.synthesize({ text: scene.narration, voice: scene.voice }, outputPath);

    // Loudness measurement needs ffmpeg's loudnorm filter; skip for the local
    // WAV fallback where consistency matters less than just unblocking tests.
    const gain = providerName === "openai" ? await measureLoudnessGain(outputPath) : 1;

    const leadInSeconds = scene.leadInSeconds ?? DEFAULT_LEAD_IN_SECONDS;
    const tailSeconds = scene.tailSeconds ?? DEFAULT_TAIL_SECONDS;

    const subtitles = generateSubtitles(scene.narration, result.durationInSeconds, {
      offsetSeconds: leadInSeconds,
      wordTimings: result.wordTimings,
    });

    manifest.scenes[scene.id] = {
      audioRelativePath: `audio/${lesson.id}/${scene.id}.${fileExtension}`,
      durationInSeconds: result.durationInSeconds,
      leadInSeconds,
      tailInSeconds: tailSeconds,
      gain,
      subtitles,
      provider: provider.name,
      voice: scene.voice ?? "default",
    };

    console.log(`${result.durationInSeconds.toFixed(2)}s, gain ${gain.toFixed(2)}x`);
  }

  const manifestPath = path.join(outputDir, "narration-manifest.json");
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  console.log(`\nWrote manifest: ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
