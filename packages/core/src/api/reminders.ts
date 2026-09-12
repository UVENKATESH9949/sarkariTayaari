import { apiFetch } from "./client";

/**
 * Exam Guide spec §8 "Reminder System". Every call needs a signed-in user's token — a
 * reminder or a device token with no owner has nothing to be personal to, so unlike most
 * of this app's `api/` modules there is no anonymous path here.
 */

export type ReminderRequest = {
  examCode: string;
  importantDateId: string | null;
  /** ISO-8601 with an offset, matching the backend's OffsetDateTime. */
  remindAt: string;
  message: string;
};

export type Reminder = {
  id: string;
  examCode: string;
  importantDateId: string | null;
  remindAt: string;
  message: string;
  sent: boolean;
};

export function registerPushToken(expoToken: string, platform: string, authToken: string): Promise<void> {
  return apiFetch<void>("/push-tokens", {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: { expoToken, platform },
  });
}

export function createReminder(request: ReminderRequest, authToken: string): Promise<Reminder> {
  return apiFetch<Reminder>("/reminders", {
    method: "POST",
    headers: { Authorization: `Bearer ${authToken}` },
    body: request,
  });
}

export function listReminders(authToken: string): Promise<Reminder[]> {
  return apiFetch<Reminder[]>("/reminders", { headers: { Authorization: `Bearer ${authToken}` } });
}

export function cancelReminder(id: string, authToken: string): Promise<void> {
  return apiFetch<void>(`/reminders/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${authToken}` },
  });
}
