import { Directory, File, Paths } from "expo-file-system";
import { and, eq, ne } from "drizzle-orm";
import {
  ApiError,
  fetchQuestionLessonVideo,
  fetchTopicLessonVideo,
  lessonVideoStreamUrl,
  type LessonVideoAvailability,
} from "@sarkaritaiyaari/core/api";
import { db } from "../db/client";
import { lessonVideos } from "../db/schema";
import { loadSession } from "../db/authSession";

/**
 * The on-device lesson video cache.
 *
 * <p>The product rule this exists to serve: internet should be needed to OBTAIN a lesson, not to
 * study it. Once a video is on the device it plays with no network at all, and it is never
 * downloaded twice.
 *
 * <p>Built on the same primitives `sync/mediaDownload.ts` already proved for question images —
 * `expo-file-system`'s SDK 57 class API (`Paths`/`File`/`Directory`) writing into the app's own
 * document directory, with the local path recorded on a row. `expo-image`-style managed caches
 * were rejected there for the same reason they would be wrong here: an evictable cache with
 * nothing recording the eviction is an accelerator, not an offline guarantee.
 *
 * <p><strong>The cache key is (videoId, contentVersion), never videoId alone.</strong> A corrected
 * lesson is published as a new version, and a device holding the old file must be able to notice.
 * Keying on the id alone is how a student would keep watching a superseded lesson forever.
 *
 * <p>Downloads are authenticated. The stream endpoint enforces publication and entitlement, so the
 * bearer token travels with the download request.
 */

const videoDir = new Directory(Paths.document, "lesson-videos");

function ensureVideoDir(): void {
  if (!videoDir.exists) {
    videoDir.create({ intermediates: true, idempotent: true });
  }
}

function fileNameFor(videoId: string, contentVersion: number): string {
  return `${videoId}-v${contentVersion}.mp4`;
}

export type LessonVideoOwner = { kind: "TOPIC" | "QUESTION"; id: string };

/**
 * What the UI should show. A discriminated union rather than a bag of booleans, so a screen
 * cannot accidentally render "downloading" and "unavailable" at the same time.
 */
export type LessonVideoState =
  /** Nobody has made a lesson for this yet. Show nothing at all — not an error. */
  | { kind: "none" }
  /** A file is on this device and will play with no network. */
  | { kind: "ready"; videoId: string; localUri: string; durationSeconds: number | null; resolvedVia: "TOPIC" | "QUESTION" | null }
  /** A lesson exists on the server but has not been downloaded yet. */
  | { kind: "downloadable"; videoId: string; sizeBytes: number | null; durationSeconds: number | null; resolvedVia: "TOPIC" | "QUESTION" | null; playbackPath: string }
  /** Being generated. Show a calm waiting state, never a render-pipeline detail. */
  | { kind: "preparing" }
  /** Generation failed. Offer a retry; the written explanation is unaffected. */
  | { kind: "failed" }
  /** Exists, but this account does not hold the entitlement. */
  | { kind: "locked"; durationSeconds: number | null }
  /** No network AND no local copy. The one state the student must be told plainly. */
  | { kind: "offline-unavailable" }
  /** Not signed in. */
  | { kind: "signed-out" };

/** The cached row for an owner, if this device has ever asked about it. */
async function cachedRowFor(owner: LessonVideoOwner, language: string) {
  return db
    .select()
    .from(lessonVideos)
    .where(
      and(
        eq(lessonVideos.ownerKind, owner.kind),
        eq(lessonVideos.ownerId, owner.id),
        eq(lessonVideos.languageCode, language),
      ),
    )
    .get();
}

/**
 * Verifies that a recorded local file is genuinely still on disk.
 *
 * <p>A row can outlive its file: the OS can reclaim app storage, and a user can clear it. Trusting
 * `localUri` without checking is how a play button leads to a black screen.
 */
function fileStillExists(uri: string | null | undefined): boolean {
  if (!uri) return false;
  try {
    return new File(uri).exists;
  } catch {
    return false;
  }
}

/** Removes files for superseded versions of the same video, best-effort. */
async function removeSupersededFiles(videoId: string, keepVersion: number): Promise<void> {
  try {
    ensureVideoDir();
    for (const entry of videoDir.list()) {
      const name = entry.name;
      if (name.startsWith(`${videoId}-v`) && name !== fileNameFor(videoId, keepVersion)) {
        try {
          new File(videoDir, name).delete();
        } catch {
          // An orphaned file costs storage, not correctness.
        }
      }
    }
  } catch {
    // Listing can fail on a directory that does not exist yet; nothing to clean in that case.
  }
}

/** Maps a server answer onto a cached row, preserving any download already on this device. */
async function rememberAvailability(
  owner: LessonVideoOwner,
  language: string,
  availability: LessonVideoAvailability,
): Promise<void> {
  const existing = await cachedRowFor(owner, language);

  if (!availability.available || !availability.videoId) {
    // Record the miss so a screen does not re-ask the server on every render, but keep any file
    // already downloaded — an unpublished video should stop being offered, not be deleted from
    // under a student who is part-way through watching it.
    if (existing) {
      await db
        .update(lessonVideos)
        .set({ status: "ARCHIVED", playbackPath: null, checkedAt: new Date() })
        .where(eq(lessonVideos.id, existing.id));
    }
    return;
  }

  const sameVideo = existing?.id === availability.videoId;
  const sameVersion = sameVideo && existing?.contentVersion === availability.contentVersion;

  // A version change invalidates the download: keep the row, drop the stale local pointer.
  const localUri = sameVersion ? existing?.localUri ?? null : null;
  const downloadedAt = sameVersion ? existing?.downloadedAt ?? null : null;

  if (existing && existing.id !== availability.videoId) {
    await db.delete(lessonVideos).where(eq(lessonVideos.id, existing.id));
  }

  await db
    .insert(lessonVideos)
    .values({
      id: availability.videoId,
      ownerKind: owner.kind,
      ownerId: owner.id,
      resolvedVia: availability.resolvedVia,
      languageCode: language,
      teachingLevel: availability.teachingLevel ?? "STANDARD",
      quality: availability.quality ?? "STANDARD",
      contentVersion: availability.contentVersion,
      status: availability.status ?? "READY",
      durationSeconds: availability.durationSeconds,
      sizeBytes: availability.sizeBytes,
      checksumSha256: availability.checksumSha256,
      requiresPremium: availability.requiresPremium,
      playbackPath: availability.playbackPath,
      localUri,
      downloadedAt,
      checkedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: lessonVideos.id,
      set: {
        ownerKind: owner.kind,
        ownerId: owner.id,
        resolvedVia: availability.resolvedVia,
        contentVersion: availability.contentVersion,
        status: availability.status ?? "READY",
        durationSeconds: availability.durationSeconds,
        sizeBytes: availability.sizeBytes,
        checksumSha256: availability.checksumSha256,
        requiresPremium: availability.requiresPremium,
        playbackPath: availability.playbackPath,
        // localUri/downloadedAt are deliberately NOT in this set. Overwriting them here would
        // throw away a download the student already paid for in data — the same rule
        // upsertQuestionsBatch follows for question_media.
        checkedAt: new Date(),
      },
    });

  if (!sameVersion && availability.videoId) {
    await removeSupersededFiles(availability.videoId, availability.contentVersion);
  }
}

/** Builds the UI state from a cached row alone — the offline path. */
function stateFromRow(row: typeof lessonVideos.$inferSelect | undefined, online: boolean): LessonVideoState {
  if (!row) {
    return online ? { kind: "none" } : { kind: "offline-unavailable" };
  }
  if (fileStillExists(row.localUri)) {
    return {
      kind: "ready",
      videoId: row.id,
      localUri: row.localUri as string,
      durationSeconds: row.durationSeconds,
      resolvedVia: (row.resolvedVia as "TOPIC" | "QUESTION" | null) ?? null,
    };
  }
  if (!online) {
    return { kind: "offline-unavailable" };
  }
  if (row.status === "FAILED") return { kind: "failed" };
  if (row.status === "ARCHIVED") return { kind: "none" };
  if (row.status !== "READY") return { kind: "preparing" };
  return {
    kind: "downloadable",
    videoId: row.id,
    sizeBytes: row.sizeBytes,
    durationSeconds: row.durationSeconds,
    resolvedVia: (row.resolvedVia as "TOPIC" | "QUESTION" | null) ?? null,
    // Streaming (playing without downloading first) reuses the same authenticated stream
    // endpoint the download path already calls - this is the one thing that makes it possible
    // without a second backend contract.
    playbackPath: row.playbackPath ?? "",
  };
}

/**
 * Resolves what this device can show for a topic or question.
 *
 * <p>Local first, always. A downloaded lesson plays whether or not the network is reachable, and
 * the server is only consulted when there is nothing playable on disk — so opening a lesson a
 * student already has costs no data at all.
 */
export async function resolveLessonVideo(
  owner: LessonVideoOwner,
  language = "en",
): Promise<LessonVideoState> {
  const cached = await cachedRowFor(owner, language);

  // A playable local file short-circuits everything, including the network check. This is the
  // whole point of the cache.
  if (cached && fileStillExists(cached.localUri)) {
    return stateFromRow(cached, true);
  }

  const token = (await loadSession())?.token ?? null;
  if (!token) return { kind: "signed-out" };

  try {
    const availability =
      owner.kind === "TOPIC"
        ? await fetchTopicLessonVideo(token, owner.id, language)
        : await fetchQuestionLessonVideo(token, owner.id, language);

    await rememberAvailability(owner, language, availability);

    if (!availability.available) return { kind: "none" };
    if (availability.requiresPremium && !availability.entitled) {
      return { kind: "locked", durationSeconds: availability.durationSeconds };
    }
    return stateFromRow(await cachedRowFor(owner, language), true);
  } catch (err) {
    // ApiError status 0 is this client's own "could not reach the server". Falling back to the
    // cached row means a flaky connection degrades to what the device already knows rather than
    // to an error screen.
    if (err instanceof ApiError && err.status === 0) {
      return stateFromRow(cached, false);
    }
    if (err instanceof ApiError && err.status === 404) {
      return { kind: "none" };
    }
    return stateFromRow(cached, false);
  }
}

export type DownloadProgress = { bytesWritten: number; totalBytes: number };

/**
 * Downloads a lesson to this device.
 *
 * <p>Writes to a temporary name and renames only on success, so an interrupted download can never
 * leave a half-written file that later looks like a complete one. That matters more here than for
 * an image: a truncated MP4 plays for a few seconds and then fails, which reads to a student as a
 * broken lesson rather than a failed download.
 *
 * <p>The bearer token travels with the request because the stream endpoint enforces publication
 * and entitlement server-side.
 *
 * <p><strong>Unverified: redirect following.</strong> With the Cloudinary storage provider the
 * stream endpoint answers 302 with a signed URL rather than the bytes. Standard HTTP clients
 * follow that, but it has not been confirmed for this downloader on a real device — check it
 * first on the device pass. If it does not follow, the backend returns the URL in the body
 * instead and this function fetches that; nothing else here changes.
 */
export async function downloadLessonVideo(
  videoId: string,
  options: { onProgress?: (progress: DownloadProgress) => void; signal?: AbortSignal } = {},
): Promise<LessonVideoState> {
  const row = await db.select().from(lessonVideos).where(eq(lessonVideos.id, videoId)).get();
  if (!row || !row.playbackPath) return { kind: "none" };

  const token = (await loadSession())?.token ?? null;
  if (!token) return { kind: "signed-out" };

  ensureVideoDir();
  const finalName = fileNameFor(videoId, row.contentVersion);
  const partialName = `${finalName}.part`;
  const partial = new File(videoDir, partialName);

  try {
    if (partial.exists) {
      partial.delete();
    }

    const downloaded = await File.downloadFileAsync(
      lessonVideoStreamUrl(row.playbackPath),
      partial,
      {
        headers: { Authorization: `Bearer ${token}` },
        idempotent: true,
        onProgress: options.onProgress,
        signal: options.signal,
      },
    );

    const finalFile = new File(videoDir, finalName);
    if (finalFile.exists) {
      finalFile.delete();
    }
    downloaded.move(finalFile);

    await db
      .update(lessonVideos)
      .set({ localUri: finalFile.uri, downloadedAt: new Date() })
      .where(eq(lessonVideos.id, videoId));

    await removeSupersededFiles(videoId, row.contentVersion);

    return {
      kind: "ready",
      videoId,
      localUri: finalFile.uri,
      durationSeconds: row.durationSeconds,
      resolvedVia: (row.resolvedVia as "TOPIC" | "QUESTION" | null) ?? null,
    };
  } catch (err) {
    try {
      if (partial.exists) partial.delete();
    } catch {
      // Best-effort cleanup of the partial file.
    }
    if (__DEV__) console.warn(`[video] download failed for ${videoId}`, err);
    return { kind: "downloadable", videoId, sizeBytes: row.sizeBytes, durationSeconds: row.durationSeconds, resolvedVia: (row.resolvedVia as "TOPIC" | "QUESTION" | null) ?? null, playbackPath: row.playbackPath ?? "" };
  }
}

/** Deletes a downloaded lesson, keeping the metadata row so it can be fetched again. */
export async function removeDownloadedLessonVideo(videoId: string): Promise<void> {
  const row = await db.select().from(lessonVideos).where(eq(lessonVideos.id, videoId)).get();
  if (row?.localUri) {
    try {
      const file = new File(row.localUri);
      if (file.exists) file.delete();
    } catch {
      // Best-effort.
    }
  }
  await db
    .update(lessonVideos)
    .set({ localUri: null, downloadedAt: null })
    .where(eq(lessonVideos.id, videoId));
}

/** Clears every downloaded lesson. Used on sign-out, so one account's downloads do not linger. */
export async function clearLessonVideoCache(): Promise<void> {
  try {
    if (videoDir.exists) {
      videoDir.delete();
    }
  } catch {
    // Best-effort.
  }
  await db.delete(lessonVideos).where(ne(lessonVideos.id, ""));
}
