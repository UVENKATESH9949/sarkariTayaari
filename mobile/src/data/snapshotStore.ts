import { eq, like } from "drizzle-orm";
import { db } from "../db/client";
import { remoteSnapshots } from "../db/schema";

/**
 * The device's copy of a server-computed answer.
 *
 * <h2>What this is for</h2>
 *
 * Some screens in this app are computed entirely on the server, from inputs the device does not
 * have — cohort timings, curated exam priority, the personalization program's own stored state.
 * Today's Plan is the first of them. The device cannot recompute those, and must not try: a
 * second implementation of the same rules is exactly the drift the personalization program spent
 * three phases removing (see D5.1 and the note in `dailyPlanData.ts`).
 *
 * But "cannot recompute" is not the same as "cannot remember". This stores the answer the server
 * last gave, so the screen can open instantly and still work with no connection.
 *
 * <h2>The rule that keeps it honest</h2>
 *
 * **A snapshot is never a source of truth.** It is a record of a decision taken elsewhere. Nothing
 * may write a snapshot it computed itself, and nothing may treat a snapshot as authoritative when
 * the real answer is reachable — the caller's job is to show the snapshot immediately and then
 * replace it with whatever the server says.
 *
 * <h2>Why one table and a string key</h2>
 *
 * Per-feature tables would be a migration and a near-identical read path each, free to drift. The
 * key carries the whole identity of a snapshot instead, and by convention it starts with a
 * namespace so a caller can clear its own without touching anyone else's.
 *
 * **The user id belongs in the key.** Signing in as a different account must never surface the
 * previous account's plan, and encoding the owner in the key makes that impossible by
 * construction rather than dependent on a sign-out hook somebody forgets to call. `clearSnapshots`
 * exists anyway, and sign-out calls it — belt and braces, because a stale snapshot is the kind of
 * bug that looks like a data leak.
 */
export type Snapshot<T> = {
  payload: T;
  /** Epoch millis when the server answered. */
  fetchedAt: number;
};

/**
 * Builds a namespaced key. Every part is included verbatim, so a caller changing what identifies
 * its snapshot (adding the exam, adding the date) naturally misses the old rows rather than
 * silently reading them as if they still applied.
 */
export function snapshotKey(namespace: string, ...parts: (string | null | undefined)[]): string {
  return [namespace, ...parts.map((p) => p ?? "-")].join(":");
}

/**
 * Reads a snapshot, or null when there is none.
 *
 * A row whose payload will not parse is treated as absent rather than thrown: the payload is
 * whatever the server sent at some point in the past, and a caller that cannot read it should
 * fall back to fetching, not crash a screen.
 */
export async function readSnapshot<T>(key: string): Promise<Snapshot<T> | null> {
  try {
    const row = await db.select().from(remoteSnapshots).where(eq(remoteSnapshots.key, key)).get();
    if (!row) return null;
    return { payload: JSON.parse(row.payload) as T, fetchedAt: row.fetchedAt };
  } catch (err) {
    console.warn("Failed to read snapshot", key, err);
    return null;
  }
}

/**
 * Stores a snapshot, replacing any previous one for the same key.
 *
 * Fire-and-forget by convention: the screen has already rendered the value by the time this runs,
 * and a failed write costs the next open being slow, not the current one being wrong. Callers
 * should not await it on a render path.
 */
export async function writeSnapshot<T>(key: string, payload: T): Promise<void> {
  try {
    const row = { key, payload: JSON.stringify(payload), fetchedAt: Date.now() };
    await db
      .insert(remoteSnapshots)
      .values(row)
      .onConflictDoUpdate({
        target: remoteSnapshots.key,
        set: { payload: row.payload, fetchedAt: row.fetchedAt },
      });
  } catch (err) {
    console.warn("Failed to write snapshot", key, err);
  }
}

/**
 * Drops snapshots — all of them, or just one namespace.
 *
 * Called on sign-out. Failure is swallowed for the same reason as above, and because the key
 * already carries the user id: a missed clear leaves rows that the next account cannot read
 * anyway, so this is the second line of defence rather than the only one.
 */
export async function clearSnapshots(namespace?: string): Promise<void> {
  try {
    if (namespace) {
      await db.delete(remoteSnapshots).where(like(remoteSnapshots.key, `${namespace}:%`));
    } else {
      await db.delete(remoteSnapshots);
    }
  } catch (err) {
    console.warn("Failed to clear snapshots", err);
  }
}
