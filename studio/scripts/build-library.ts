import { readdir, readFile, stat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateLesson } from "@sarkaritaayari/lesson-engine";
import { getAudioDuration } from "@sarkaritaayari/tts";

/**
 * Scans lessons/*.json (already carrying subject/topic/language metadata
 * from the Milestone 4 schema) and matches each to output/<id>.mp4 by
 * filename convention. Duration is read straight from the rendered video
 * file itself (ground truth) rather than recomputed from scene timings.
 * Writes library/library.json for the static viewer page to fetch.
 */

interface LibraryEntry {
  id: string;
  title: string;
  exam: string;
  subject: string;
  topic: string;
  language: string;
  sceneCount: number;
  durationSeconds: number | null;
  videoUrl: string | null;
  status: "ready" | "not-rendered";
}

const REPO_ROOT = process.cwd();
const LESSONS_DIR = path.join(REPO_ROOT, "lessons");
const OUTPUT_DIR = path.join(REPO_ROOT, "output");
const LIBRARY_DIR = path.join(REPO_ROOT, "library");

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function buildEntry(fileName: string): Promise<LibraryEntry> {
  const raw = JSON.parse(await readFile(path.join(LESSONS_DIR, fileName), "utf8"));
  const lesson = validateLesson(raw);

  const videoPath = path.join(OUTPUT_DIR, `${lesson.id}.mp4`);
  const rendered = await fileExists(videoPath);

  let durationSeconds: number | null = null;
  if (rendered) {
    try {
      durationSeconds = await getAudioDuration(videoPath);
    } catch (error) {
      console.warn(`  warning: could not read duration for ${lesson.id}.mp4: ${(error as Error).message}`);
    }
  }

  return {
    id: lesson.id,
    title: lesson.title,
    exam: lesson.exam,
    subject: lesson.subject,
    topic: lesson.topic,
    language: lesson.language,
    sceneCount: lesson.scenes.length,
    durationSeconds,
    videoUrl: rendered ? `/output/${lesson.id}.mp4` : null,
    status: rendered ? "ready" : "not-rendered",
  };
}

async function main() {
  const files = (await readdir(LESSONS_DIR)).filter((f) => f.endsWith(".json"));

  if (files.length === 0) {
    console.log("No lesson JSON files found in lessons/.");
  }

  const entries: LibraryEntry[] = [];
  for (const file of files) {
    console.log(`Reading ${file}...`);
    entries.push(await buildEntry(file));
  }

  entries.sort((a, b) => a.title.localeCompare(b.title));

  await mkdir(LIBRARY_DIR, { recursive: true });
  const libraryPath = path.join(LIBRARY_DIR, "library.json");
  await writeFile(
    libraryPath,
    JSON.stringify({ generatedAt: new Date().toISOString(), videos: entries }, null, 2),
    "utf8"
  );

  const readyCount = entries.filter((e) => e.status === "ready").length;
  const pendingCount = entries.length - readyCount;
  console.log(`\nWrote ${libraryPath}`);
  console.log(`${entries.length} lesson(s): ${readyCount} ready, ${pendingCount} not yet rendered.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
