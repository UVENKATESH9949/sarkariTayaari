import Constants from "expo-constants";

/**
 * Where mobile's backend lives. The one piece of the old `src/api/` folder that could NOT move
 * into `@sarkaritaiyaari/core` in TASK-2601 Phase 0, because resolving it depends on Expo:
 * a phone running a dev build has to reach the laptop serving Metro, which is what `hostUri`
 * gives us and what a browser has no equivalent of. `_layout.tsx` hands the result to the
 * shared client via `configureApi()`.
 */

const BACKEND_PORT = 8080;

function resolveBaseUrl(): string {
  const envUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
  if (envUrl) {
    return envUrl;
  }

  const hostUri = Constants.expoConfig?.hostUri;
  if (hostUri) {
    const host = hostUri.split(":")[0];
    return `http://${host}:${BACKEND_PORT}/api`;
  }

  return "http://localhost:8080/api";
}

export const API_BASE_URL = resolveBaseUrl();
