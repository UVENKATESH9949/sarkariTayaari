/**
 * The HTTP layer shared by mobile/ and web/.
 *
 * Uses the global `fetch` and nothing else — no React Native, no Node, no DOM types — which
 * is what let this whole folder move out of mobile/ almost unchanged in TASK-2601 Phase 0.
 * The one thing that could not move is where the base URL comes from: mobile derives it from
 * Expo's `hostUri` so a phone on the same wifi can reach a laptop's dev server, while web
 * reads a Vite env var. So the URL is injected rather than imported.
 *
 * There is deliberately no auth interceptor. Every authenticated call takes its token as an
 * explicit parameter and sets the header itself, so it is always visible at the call site
 * which requests carry credentials and which are anonymous. That distinction matters against
 * this backend: sending no Authorization header means "anonymous", but sending a present-but-
 * invalid one is a 401 — so a signed-out client must omit the header entirely, not send an
 * empty string.
 */

let configuredBaseUrl: string | null = null;

/**
 * Must be called once at app startup, before any request. Fails loudly rather than falling
 * back to a default, because a silently wrong base URL looks like a backend outage and gets
 * debugged in the wrong place.
 */
export function configureApi(options: { baseUrl: string }): void {
  configuredBaseUrl = options.baseUrl.replace(/\/+$/, "");
}

export function apiBaseUrl(): string {
  if (configuredBaseUrl === null) {
    throw new Error(
      "configureApi({ baseUrl }) must be called before any API request. " +
        "mobile/ does this in src/app/_layout.tsx; web/ in src/main.tsx.",
    );
  }
  return configuredBaseUrl;
}

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type RequestOptions = Omit<RequestInit, "body"> & { body?: unknown };

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, headers, ...rest } = options;

  let response: Response;
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...rest,
      headers: { "Content-Type": "application/json", ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError("Could not reach the server. Check your connection and try again.", 0);
  }

  if (!response.ok) {
    const errorBody: { error?: string } = await response.json().catch(() => ({}));
    throw new ApiError(errorBody.error || `Request failed (${response.status})`, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}
