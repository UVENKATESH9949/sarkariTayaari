import { eq, sql } from "drizzle-orm";
import { db } from "./client";
import { radarCache } from "./schema";
import type { WeaknessRadar } from "@sarkaritaiyaari/core/intelligence";

/**
 * Local reads and writes for the last Weakness Radar the server produced (migration 0018).
 *
 * Write-through: the radar is fetched live, rendered, and stored — so the next launch with no
 * network still has something true to show, which is the supplied spec's §15/§21 offline
 * requirement ("gracefully display the last known state", never a blank screen).
 *
 * Deliberately not part of the reference sync. That pipeline carries public content and runs
 * for signed-out users too; this is one student's derived diagnosis, so it belongs on the
 * screen's own read path, the same way `data/examGuideData.ts` handles its hybrid read.
 */

export type CachedRadar = { radar: WeaknessRadar; fetchedAtMs: number };

export async function readCachedRadar(examCode: string): Promise<CachedRadar | null> {
  const row = await db
    .select()
    .from(radarCache)
    .where(eq(radarCache.examCode, examCode))
    .get();
  if (!row) return null;

  try {
    return {
      radar: JSON.parse(row.payloadJson) as WeaknessRadar,
      fetchedAtMs: row.fetchedAt.getTime(),
    };
  } catch {
    /*
     * A payload this device cannot parse is treated as no cache at all rather than as an
     * error. The realistic cause is a response shape from a much older or newer release, and
     * the cost of guessing wrong is a crash on a screen whose whole job is to work offline —
     * so the screen falls through to its empty state and the next successful fetch overwrites
     * this row anyway.
     */
    return null;
  }
}

export async function writeCachedRadar(radar: WeaknessRadar): Promise<void> {
  const now = new Date();
  await db
    .insert(radarCache)
    .values({
      examCode: radar.examCode,
      algorithmVersion: radar.algorithmVersion,
      computedAt: radar.computedAt ? new Date(radar.computedAt) : null,
      fetchedAt: now,
      payloadJson: JSON.stringify(radar),
    })
    .onConflictDoUpdate({
      target: radarCache.examCode,
      set: {
        algorithmVersion: sql`excluded.algorithm_version`,
        computedAt: sql`excluded.computed_at`,
        fetchedAt: sql`excluded.fetched_at`,
        payloadJson: sql`excluded.payload_json`,
      },
    });
}

/**
 * Drops every cached radar.
 *
 * Called on sign-out: this is one student's diagnosis, and leaving it behind would show the
 * next person to use the phone someone else's weaknesses. Unlike `app_preferences` (a device
 * setting, deliberately never cleared), this is account data.
 */
export async function clearCachedRadars(): Promise<void> {
  await db.delete(radarCache);
}
