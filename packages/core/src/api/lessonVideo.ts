import { apiBaseUrl, apiFetch } from "./client";

/**
 * Lesson video availability (see `api/LESSON-VIDEOS.md`).
 *
 * Deliberately fetched on demand per topic or question rather than carried in reference sync.
 * Shipping metadata for every video to every device would make students who never watch one pay
 * for them in data, which is the opposite of what this product is for.
 */

/** `NOT_AVAILABLE` is absent on purpose — no row is what not-available means. */
export type LessonVideoStatus =
  | "QUEUED"
  | "PENDING_UPLOAD"
  | "UPLOADING"
  | "UPLOAD_FAILED"
  | "GENERATING"
  | "PROCESSING"
  | "READY"
  | "FAILED"
  | "ARCHIVED";

export type TeachingLevel = "BEGINNER" | "STANDARD" | "ADVANCED";
export type VideoQuality = "LOW" | "STANDARD" | "HIGH";

export type LessonVideoAvailability = {
  available: boolean;
  videoId: string | null;
  status: LessonVideoStatus | null;
  /**
   * Which owner the server actually matched. A question with no video of its own resolves to its
   * topic lesson, and a client that ignores this would tell the student a general topic lesson
   * was made for that one question.
   */
  resolvedVia: "TOPIC" | "QUESTION" | null;
  contentVersion: number;
  durationSeconds: number | null;
  sizeBytes: number | null;
  quality: VideoQuality | null;
  languageCode: string | null;
  teachingLevel: TeachingLevel | null;
  checksumSha256: string | null;
  requiresPremium: boolean;
  entitled: boolean;
  /** A path on this backend, never a storage URL — that is what keeps entitlement enforceable. */
  playbackPath: string | null;
};

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

export function fetchTopicLessonVideo(
  token: string,
  topicId: string,
  language = "en",
): Promise<LessonVideoAvailability> {
  return apiFetch<LessonVideoAvailability>(
    `/topics/${topicId}/lesson-video?language=${encodeURIComponent(language)}`,
    { headers: authHeaders(token) },
  );
}

export function fetchQuestionLessonVideo(
  token: string,
  questionId: string,
  language = "en",
): Promise<LessonVideoAvailability> {
  return apiFetch<LessonVideoAvailability>(
    `/questions/${questionId}/lesson-video?language=${encodeURIComponent(language)}`,
    { headers: authHeaders(token) },
  );
}

/**
 * One published topic video, as the catalog returns it.
 *
 * Deliberately has no topic NAME on it. The app already holds the whole exam/subject/topic tree
 * locally from reference sync, so a name here would be a second copy of something that can go
 * stale — and the two disagreeing is how a video ends up labelled with a topic's old name.
 */
export type TopicVideoCatalogEntry = {
  topicId: string;
  /** The topic's subject, so a browse screen can group without mapping ids itself. */
  subjectId: string | null;
  videoId: string;
  contentVersion: number;
  durationSeconds: number | null;
  sizeBytes: number | null;
  languageCode: string;
  teachingLevel: TeachingLevel;
  quality: VideoQuality;
  checksumSha256: string | null;
  requiresPremium: boolean;
  entitled: boolean;
  playbackPath: string;
};

export type TopicVideoCatalog = { items: TopicVideoCatalogEntry[] };

/**
 * Every published topic video, optionally narrowed to one subject.
 *
 * This is what the AI Videos browse screen reads, and it exists so that screen is ONE request
 * instead of one per topic — SSC CGL alone has 61 topics, and asking about each separately is the
 * wrong shape on a slow connection.
 *
 * The response is sparse: a topic with no video is simply absent. That absence is what the screen
 * renders its "no video yet" state from, so no topic is ever hidden for lack of a video.
 */
export function fetchLessonVideoCatalog(
  token: string,
  options: { subjectId?: string; language?: string } = {},
): Promise<TopicVideoCatalog> {
  const params = new URLSearchParams({ language: options.language ?? "en" });
  if (options.subjectId) {
    params.set("subjectId", options.subjectId);
  }
  return apiFetch<TopicVideoCatalog>(`/lesson-videos/catalog?${params.toString()}`, {
    headers: authHeaders(token),
  });
}

/**
 * Absolute URL for the stream endpoint.
 *
 * The download layer needs a full URL rather than a path, and it must send the same bearer token
 * the availability call used — the stream endpoint enforces publication and entitlement, so an
 * unauthenticated request for it is correctly refused.
 */
export function lessonVideoStreamUrl(playbackPath: string): string {
  // playbackPath already starts with /api; apiBaseUrl() ends with /api, so trim one.
  const base = apiBaseUrl().replace(/\/api$/, "");
  return `${base}${playbackPath}`;
}
