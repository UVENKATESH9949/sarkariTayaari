import {
  fetchLessonVideoCatalog,
  type TopicVideoCatalogEntry,
} from "@sarkaritaiyaari/core/api";
import { loadSession } from "../db/authSession";
import { readSnapshot, snapshotKey, writeSnapshot } from "./snapshotStore";

/**
 * Which topics have a published AI video.
 *
 * The session is read here rather than passed in, so no screen ever holds a bearer token - the
 * convention `weaknessRadarData.ts` set and every data facade since has followed.
 *
 * **One request answers the whole screen.** The per-topic endpoint exists and is right for the
 * quiz card, which asks about exactly one question; asking it once per topic to render a subject
 * would be dozens of round trips on a connection this product assumes is slow.
 *
 * **It is cached, and that is a different judgement from the roadmap's.** The roadmap deliberately
 * has no cache because its order and its minutes shift under it, so a saved copy is quietly wrong.
 * This is a list of which topics have a video - it changes only when an admin publishes one, and a
 * saved copy being a few minutes behind means a student misses a brand-new video until the refresh
 * lands, never that they are shown something false. Being able to browse the library on a dropped
 * connection is worth much more than that.
 *
 * The cache is read-through and stale-while-revalidate, the same policy `dailyPlanData.ts` uses:
 * return what is saved immediately, refresh behind it, tell the caller when the fresh answer
 * arrives. A failed refresh never replaces a usable list with an error - that rule is what makes a
 * cache an improvement rather than a new way to show nothing.
 */

const NAMESPACE = "lesson-video-catalog";

export type VideoCatalog = {
  /** Keyed by topic id. A topic absent from here has no published video. */
  byTopicId: Record<string, TopicVideoCatalogEntry>;
  /** Epoch millis the server answered, or null when this came from a live fetch just now. */
  savedAt: number | null;
};

export type VideoCatalogResult =
  | { status: "signed-out" }
  | { status: "ready"; catalog: VideoCatalog; stale: boolean }
  | { status: "unavailable"; message: string };

function index(items: TopicVideoCatalogEntry[], savedAt: number | null): VideoCatalog {
  const byTopicId: Record<string, TopicVideoCatalogEntry> = {};
  for (const item of items) {
    // The server guarantees one published video per (topic, language, level, quality) with a
    // unique index, so a collision here would mean that rule was relaxed. Keeping the first is
    // safe either way: the query orders by content version descending, so it is the newest.
    if (!byTopicId[item.topicId]) {
      byTopicId[item.topicId] = item;
    }
  }
  return { byTopicId, savedAt };
}

/**
 * Reads the catalog, preferring a saved copy and refreshing behind it.
 *
 * @param onRefreshed called only when a background refresh genuinely produced a newer list. It is
 *                    not called on failure, deliberately: a screen showing a saved list must not
 *                    be blanked because a refresh could not reach the server.
 */
export async function getVideoCatalog(
  examCode: string | null,
  onRefreshed?: (catalog: VideoCatalog) => void,
): Promise<VideoCatalogResult> {
  const session = await loadSession();
  if (!session?.token) return { status: "signed-out" };
  const token = session.token;

  // Keyed per account as well as per exam: two students on one phone must not read each other's
  // entitlement flags, which ride along on every entry. Keyed on the user id rather than anything
  // derived from the token - a key is stored in plain text, and no part of a bearer token belongs
  // in one. Same choice dailyPlanData.ts already made.
  const key = snapshotKey(NAMESPACE, session.user.id, examCode);

  const saved = await readSnapshot<TopicVideoCatalogEntry[]>(key);
  if (saved) {
    void refreshInBackground(token, key, onRefreshed);
    return { status: "ready", catalog: index(saved.payload, saved.fetchedAt), stale: true };
  }

  try {
    const response = await fetchLessonVideoCatalog(token);
    await writeSnapshot(key, response.items);
    return { status: "ready", catalog: index(response.items, null), stale: false };
  } catch {
    return {
      status: "unavailable",
      message: "We couldn't check for video lessons just now. Try again when you have a connection.",
    };
  }
}

async function refreshInBackground(
  token: string,
  key: string,
  onRefreshed?: (catalog: VideoCatalog) => void,
): Promise<void> {
  try {
    const response = await fetchLessonVideoCatalog(token);
    await writeSnapshot(key, response.items);
    onRefreshed?.(index(response.items, null));
  } catch {
    // Swallowed on purpose. The caller is already showing a usable saved list; turning a failed
    // background refresh into a visible error would punish a student for a network blip that cost
    // them nothing.
  }
}
