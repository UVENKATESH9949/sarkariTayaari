import { trackEvent } from "./analytics";

/**
 * The startup state machine's milestones, in the order a first launch normally reaches them.
 *
 * One vocabulary, so a stuck launch can be read from a log as "reached X, never reached Y"
 * rather than reconstructed from scattered messages. Nothing here ever carries a code, a token,
 * an email address or a name — only which step happened.
 */
export type StartupEvent =
  | "AUTH_RESTORED"
  | "SIGNED_IN"
  | "ACCOUNT_RESTORE_STARTED"
  | "ACCOUNT_RESTORE_FINISHED"
  | "USER_PROFILE_LOADED"
  | "ONBOARDING_REQUIRED"
  | "ONBOARDING_SHOWN"
  | "ONBOARDING_RESTORED_FROM_ACCOUNT"
  | "ONBOARDING_COMPLETED"
  | "PREPARATION_STEP"
  | "PREPARATION_STEP_TIMED_OUT"
  | "PREPARATION_READY"
  | "NAVIGATING_HOME";

/**
 * Dev builds print to Metro; every build leaves a Sentry breadcrumb (the same channel
 * `trackEvent` already uses), so a production crash report shows how far startup got.
 * To silence the console output entirely, this one `__DEV__` check is the only switch.
 */
export function startupLog(event: StartupEvent, detail?: Record<string, string | number | boolean>) {
  if (__DEV__) console.log(`[startup] ${event}${detail ? " " + JSON.stringify(detail) : ""}`);
  trackEvent(`startup.${event}`, detail);
}

/**
 * Resolves with the promise's value, or with `fallback` once `ms` has passed — never rejects
 * past the ceiling and never leaves the caller waiting on a request that will not answer.
 *
 * This is NOT how the preparation screen finishes; that is the work completing. It is the
 * guard for one best-effort step whose request hangs (the shared API client has no timeout),
 * so a dead network cannot hold a student on a loading screen over a prefetch.
 */
export async function withCeiling<T>(label: string, work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const ceiling = new Promise<T>((resolve) => {
    timer = setTimeout(() => {
      startupLog("PREPARATION_STEP_TIMED_OUT", { step: label, ms });
      resolve(fallback);
    }, ms);
  });
  try {
    return await Promise.race([work, ceiling]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
