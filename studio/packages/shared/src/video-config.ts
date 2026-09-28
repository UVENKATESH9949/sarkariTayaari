/**
 * Centralized composition config. Scenes must read dimensions from here
 * (never hardcode 1920x1080) so a future 9:16 composition needs no
 * per-scene changes — see project spec section 12.
 */
export interface VideoFormat {
  width: number;
  height: number;
  fps: number;
}

export const VIDEO_FORMATS = {
  landscape: { width: 1920, height: 1080, fps: 30 },
  portrait: { width: 1080, height: 1920, fps: 30 },
} as const satisfies Record<string, VideoFormat>;

export type VideoFormatName = keyof typeof VIDEO_FORMATS;
