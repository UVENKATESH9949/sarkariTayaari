import { Directory, File, Paths } from "expo-file-system";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "../db/client";
import { questionMedia } from "../db/schema";

/**
 * Media pre-download (TASK-2301 Phase P3) — the resolved architecture decision from this
 * task's own assessment: `expo-image`'s `Image.prefetch()` writes into an evictable managed
 * cache with nothing recording the eviction, which is an accelerator, not an offline
 * guarantee. Downloading via `expo-file-system` into the app's own document directory,
 * recording `localUri`/`downloadedAt` on the owning row, is what makes the guarantee real —
 * the same "sync makes a row locally durable" responsibility `writeQuestions.ts` already
 * treats question rows themselves as having.
 *
 * expo-file-system's SDK 57 API is class-based (`Paths`/`File`/`Directory`), not the older
 * flat-function API (`documentDirectory`, `downloadAsync`, ...) — confirmed against this
 * package's own installed `.d.ts` files, per this project's own mobile/AGENTS.md warning to
 * check the exact versioned API before writing filesystem code.
 */
const mediaDir = new Directory(Paths.document, "question-media");

function ensureMediaDir(): void {
  if (!mediaDir.exists) {
    mediaDir.create({ intermediates: true, idempotent: true });
  }
}

function extensionFor(mimeType: string | null, url: string): string {
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  const match = /\.(png|jpe?g|webp|gif)(\?|#|$)/i.exec(url);
  return match ? `.${match[1].toLowerCase()}` : "";
}

/**
 * Downloads every media row that has no local copy yet. Failures are swallowed per-asset —
 * a slow or broken image must not fail the sync it rides along on, and the renderer's own
 * local-or-live fallback means a still-missing `localUri` just falls back to a live fetch,
 * exactly like a question mid-download already does for `data/hybridSource.ts`.
 */
export async function downloadPendingMedia(): Promise<void> {
  const pending = await db
    .select()
    .from(questionMedia)
    .where(and(eq(questionMedia.isDeleted, false), isNull(questionMedia.localUri)))
    .all();
  if (pending.length === 0) return;

  ensureMediaDir();
  for (const media of pending) {
    try {
      const filename = `${media.id}${extensionFor(media.mimeType, media.url)}`;
      const destination = new File(mediaDir, filename);
      const downloaded = await File.downloadFileAsync(media.url, destination, { idempotent: true });
      await db
        .update(questionMedia)
        .set({ localUri: downloaded.uri, downloadedAt: new Date() })
        .where(eq(questionMedia.id, media.id));
    } catch (err) {
      if (__DEV__) console.warn(`[sync] failed to download question media ${media.id}`, err);
    }
  }
}

/**
 * Deletes one on-disk media file, best-effort — a file that's already gone (or was never
 * downloaded, `uri` null) is not an error. The low-level primitive both cleanup call sites
 * below build on, so each can fetch the `localUri` to delete via whichever DB handle it
 * already holds (a plain `db` read outside a transaction, or a `tx` read from inside one —
 * mixing the two is what this split avoids).
 */
export async function deleteMediaFileAtUri(uri: string | null | undefined): Promise<void> {
  if (!uri) return;
  try {
    const file = new File(uri);
    if (file.exists) {
      file.delete();
    }
  } catch {
    // Best-effort cleanup — a failed delete leaves an orphaned file, not a broken app.
  }
}

/**
 * Deletes the on-disk files for media rows about to be removed from the database — the
 * cleanup path the architecture proposal flagged as a real, disclosed gap: without this,
 * local storage for a removed asset would grow without bound. Reads via the module-level
 * `db`, so this is only safe to call *outside* an already-open transaction (see
 * writeQuestionGroups) — a call site inside one (upsertQuestionsBatch) instead reads
 * `localUri` via its own `tx` handle and calls {@link deleteMediaFileAtUri} directly.
 */
export async function deleteLocalMediaFiles(mediaIds: string[]): Promise<void> {
  if (mediaIds.length === 0) return;
  const rows = await db
    .select({ localUri: questionMedia.localUri })
    .from(questionMedia)
    .where(inArray(questionMedia.id, mediaIds))
    .all();
  for (const row of rows) {
    await deleteMediaFileAtUri(row.localUri);
  }
}
