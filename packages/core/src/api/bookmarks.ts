import { apiFetch } from "./client";

export type BookmarkPayload = {
  questionId: string;
  deleted: boolean;
  updatedAt: string;
};

export type BookmarkSyncResult = {
  stored: number;
};

export type BookmarkRestoreResult = {
  bookmarks: BookmarkPayload[];
};

/** Safe to retry — the server keeps whichever update is newer, by updatedAt. */
export function uploadBookmarks(token: string, bookmarks: BookmarkPayload[]) {
  return apiFetch<BookmarkSyncResult>("/bookmarks/sync", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: { bookmarks },
  });
}

/** Only what's currently bookmarked — removed ones are not sent back down. */
export function restoreBookmarks(token: string) {
  return apiFetch<BookmarkRestoreResult>("/bookmarks", {
    headers: { Authorization: `Bearer ${token}` },
  });
}
