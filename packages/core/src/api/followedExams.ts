import { apiFetch } from "./client";

export type FollowedExamPayload = {
  examCode: string;
  deleted: boolean;
  updatedAt: string;
};

export type FollowedExamSyncResult = {
  stored: number;
};

export type FollowedExamRestoreResult = {
  exams: FollowedExamPayload[];
};

/** Safe to retry — the server keeps whichever update is newer, by updatedAt. */
export function uploadFollowedExams(token: string, exams: FollowedExamPayload[]) {
  return apiFetch<FollowedExamSyncResult>("/followed-exams/sync", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: { exams },
  });
}

/** Only what's currently followed — unfollowed ones are not sent back down. */
export function restoreFollowedExams(token: string) {
  return apiFetch<FollowedExamRestoreResult>("/followed-exams", {
    headers: { Authorization: `Bearer ${token}` },
  });
}
