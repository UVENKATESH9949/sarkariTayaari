import type { AdHocMockSpec } from "./types";

/**
 * Expo Router params are strings only, and an `AdHocMockSpec` has too many optional array/
 * scalar fields to juggle as separate params without `start.tsx`/`test.tsx` needing to know
 * every one of them individually. One JSON param instead — `start.tsx` and `test.tsx` each
 * check for its presence once and otherwise fall back to the existing `paperId` path.
 */

export function encodeAdHocSpec(spec: AdHocMockSpec): string {
  return encodeURIComponent(JSON.stringify(spec));
}

export function decodeAdHocSpec(raw: string | undefined): AdHocMockSpec | null {
  if (!raw) return null;
  try {
    return JSON.parse(decodeURIComponent(raw)) as AdHocMockSpec;
  } catch {
    return null;
  }
}
