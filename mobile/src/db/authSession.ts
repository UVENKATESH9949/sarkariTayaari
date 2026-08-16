import { eq } from "drizzle-orm";
import { db } from "./client";
import { authSession } from "./schema";
import type { AuthResult, AuthUser } from "../api/auth";

const KEY = "current";

export type StoredSession = {
  token: string;
  user: AuthUser;
  expiresAt: Date | null;
};

export async function loadSession(): Promise<StoredSession | null> {
  const row = await db.select().from(authSession).where(eq(authSession.key, KEY)).get();
  if (!row) return null;

  // A token past its expiry is worthless; drop it rather than letting the app make a
  // doomed request and show an error on launch.
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
    await clearSession();
    return null;
  }

  return {
    token: row.token,
    expiresAt: row.expiresAt,
    user: { id: row.userId, email: row.email, displayName: row.displayName },
  };
}

export async function saveSession(result: AuthResult): Promise<void> {
  const fields = {
    token: result.token,
    userId: result.user.id,
    email: result.user.email,
    displayName: result.user.displayName,
    expiresAt: result.expiresAt ? new Date(result.expiresAt) : null,
  };
  await db
    .insert(authSession)
    .values({ key: KEY, ...fields })
    .onConflictDoUpdate({ target: authSession.key, set: fields });
}

export async function clearSession(): Promise<void> {
  await db.delete(authSession).where(eq(authSession.key, KEY));
}
