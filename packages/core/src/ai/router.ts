/**
 * The AI router (`AI_ARCHITECTURE.md` §5).
 *
 * It answers one question — *what is the cheapest tier that fully answers this task?* — and it
 * is pure orchestration: it performs no I/O, knows no provider, and imports nothing
 * platform-specific. Each tier is a handler the host app supplies, so `mobile/` can back
 * `cached` with SQLite while `web/` backs it with nothing at all, and this file does not change.
 *
 * Two behaviours here are easy to get wrong and are therefore enforced rather than documented:
 *
 * **Local is tried before cloud even when both are available.** It is free, private and usually
 * faster than a round trip. Cloud is the quality escalation, not the default. Framing the choice
 * as "offline? then local" gets this backwards and quietly bills for work a device could have
 * done itself.
 *
 * **A tier never propagates a failure — it falls through.** A handler that throws, returns
 * nothing, or returns something that fails validation is recorded as an attempt and the ladder
 * continues. AI is an enhancement layer: every surface renders beside content that is already
 * correct and on screen, so the terminal state is a calm "not available", never a broken screen.
 * The brief's §41 requires this and the brief's §22 requires that malformed output specifically
 * cannot crash anything.
 */

import type { AiContext } from "./context/types";
import { contextGaps } from "./context/build";
import type { AiLanguageCode, AiTaskId, AiTier, DeviceTier } from "./tasks";
import { AI_TASKS, TIER_ORDER, meetsDeviceTier } from "./tasks";

/* ----------------------------------------------------------------------------------- inputs */

/**
 * What the host app can currently do. Every field is a fact about the device or the account, not
 * a preference — preferences belong in the flags below.
 */
export type AiCapabilities = {
  deviceTier: DeviceTier;
  online: boolean;
  /** A verified local model is installed and loadable. False until Phase 6 ships one. */
  localModelReady: boolean;
  /** Cloud AI is enabled for this build/account — the server-side flag, cached for offline use. */
  cloudEnabled: boolean;
};

/**
 * Per-task kill switch, from the cached client config. **Unknown means off**: a task absent from
 * the map is disabled, so a config that failed to load can never dark-launch something.
 */
export type AiTaskFlags = Partial<Record<AiTaskId, boolean>>;

export type AiRouteRequest = {
  taskId: AiTaskId;
  languageCode: string;
  context: AiContext;
  capabilities: AiCapabilities;
  flags: AiTaskFlags;
};

/* ---------------------------------------------------------------------------------- handlers */

export type TierOutcome<T> =
  | { status: "SERVED"; value: T }
  | { status: "UNAVAILABLE"; detail?: string };

export type TierHandler<T> = (
  request: AiRouteRequest,
) => TierOutcome<T> | Promise<TierOutcome<T>>;

/**
 * The `GENERATED` tier is split into two handlers because they have different costs and
 * different availability rules, even though they produce the same shape. Everything else maps
 * one-to-one onto a tier.
 */
export type AiTierHandlers<T> = {
  groundTruth?: TierHandler<T>;
  deterministic?: TierHandler<T>;
  cached?: TierHandler<T>;
  local?: TierHandler<T>;
  cloud?: TierHandler<T>;
};

/* ----------------------------------------------------------------------------------- results */

export type AiAttemptStatus = "SERVED" | "SKIPPED" | "UNAVAILABLE" | "ERROR";

/** One rung of the ladder, kept so a support question has an answer beyond "it didn't work". */
export type AiRouteAttempt = {
  tier: AiTier;
  /** `local` / `cloud` for the generated tier, so the two are distinguishable after the fact. */
  provider?: "local" | "cloud";
  status: AiAttemptStatus;
  detail?: string;
};

export type AiUnavailableReason =
  | "TASK_DISABLED"
  | "LANGUAGE_NOT_SUPPORTED"
  | "MISSING_CONTEXT"
  | "ALL_TIERS_DECLINED";

export type AiRouteResult<T> =
  | { status: "SERVED"; tier: AiTier; provider?: "local" | "cloud"; value: T; attempts: AiRouteAttempt[] }
  | {
      status: "UNAVAILABLE";
      reason: AiUnavailableReason;
      detail: string;
      /** What the UI should show instead. Often `null` — the screen is already correct. */
      fallback: "AUTHORED_EXPLANATION" | "DETERMINISTIC_RADAR" | null;
      attempts: AiRouteAttempt[];
    };

/* ------------------------------------------------------------------------------------ routing */

export async function routeAiTask<T>(
  request: AiRouteRequest,
  handlers: AiTierHandlers<T>,
): Promise<AiRouteResult<T>> {
  const task = AI_TASKS[request.taskId];
  const attempts: AiRouteAttempt[] = [];

  const unavailable = (reason: AiUnavailableReason, detail: string): AiRouteResult<T> => ({
    status: "UNAVAILABLE",
    reason,
    detail,
    fallback: task.groundTruthFallback,
    attempts,
  });

  if (request.flags[task.id] !== true) {
    return unavailable("TASK_DISABLED", `${task.id} is not enabled`);
  }

  // Refuse rather than fall back to another language. Answering a Hindi request in English is a
  // worse failure than answering nothing, and translating the question first is the fabrication
  // risk this whole architecture is built to avoid (decision 3, AI_ARCHITECTURE.md §13).
  if (!(task.languages as readonly string[]).includes(request.languageCode)) {
    return unavailable(
      "LANGUAGE_NOT_SUPPORTED",
      `${task.id} has no content in "${request.languageCode}"; supported: ${task.languages.join(", ")}`,
    );
  }

  const gaps = contextGaps(task, request.context);
  if (gaps.length > 0) {
    return unavailable("MISSING_CONTEXT", `${task.id} is missing context: ${gaps.join(", ")}`);
  }

  for (const tier of TIER_ORDER) {
    if (!task.tiers.includes(tier)) continue;

    if (tier === "GENERATED") {
      const generated = await runGeneratedTier(request, task.minDeviceTier, handlers, attempts);
      if (generated) return { ...generated, attempts };
      continue;
    }

    const handler =
      tier === "GROUND_TRUTH"
        ? handlers.groundTruth
        : tier === "DETERMINISTIC"
          ? handlers.deterministic
          : handlers.cached;

    if (!handler) {
      attempts.push({ tier, status: "SKIPPED", detail: "no handler supplied" });
      continue;
    }

    const outcome = await attempt(handler, request, tier, undefined, attempts);
    if (outcome) return { status: "SERVED", tier, value: outcome.value, attempts };
  }

  return unavailable("ALL_TIERS_DECLINED", `no tier could serve ${task.id}`);
}

async function runGeneratedTier<T>(
  request: AiRouteRequest,
  minDeviceTier: DeviceTier,
  handlers: AiTierHandlers<T>,
  attempts: AiRouteAttempt[],
): Promise<{ status: "SERVED"; tier: AiTier; provider: "local" | "cloud"; value: T } | null> {
  const { capabilities } = request;

  // Local first: free, private, and no round trip. Cloud is the escalation, not the default.
  if (!handlers.local) {
    attempts.push({ tier: "GENERATED", provider: "local", status: "SKIPPED", detail: "no handler supplied" });
  } else if (!capabilities.localModelReady) {
    attempts.push({ tier: "GENERATED", provider: "local", status: "SKIPPED", detail: "no local model installed" });
  } else if (!meetsDeviceTier(capabilities.deviceTier, minDeviceTier)) {
    // Loading a model on a device below the bar risks the OS killing the app, and losing
    // Practice to power a hint is a bad trade (AI_ARCHITECTURE.md §9.3).
    attempts.push({
      tier: "GENERATED",
      provider: "local",
      status: "SKIPPED",
      detail: `device is ${capabilities.deviceTier}, task needs ${minDeviceTier}`,
    });
  } else {
    const served = await attempt(handlers.local, request, "GENERATED", "local", attempts);
    if (served) return { status: "SERVED", tier: "GENERATED", provider: "local", value: served.value };
  }

  if (!handlers.cloud) {
    attempts.push({ tier: "GENERATED", provider: "cloud", status: "SKIPPED", detail: "no handler supplied" });
    return null;
  }
  if (!capabilities.cloudEnabled) {
    attempts.push({ tier: "GENERATED", provider: "cloud", status: "SKIPPED", detail: "cloud AI disabled" });
    return null;
  }
  if (!capabilities.online) {
    attempts.push({ tier: "GENERATED", provider: "cloud", status: "SKIPPED", detail: "offline" });
    return null;
  }

  const served = await attempt(handlers.cloud, request, "GENERATED", "cloud", attempts);
  return served ? { status: "SERVED", tier: "GENERATED", provider: "cloud", value: served.value } : null;
}

/**
 * Runs one handler and records what happened. A throw is caught and recorded, never rethrown —
 * this is the single place the "failures fall through" rule is implemented, so a host app cannot
 * forget it at a call site.
 */
async function attempt<T>(
  handler: TierHandler<T>,
  request: AiRouteRequest,
  tier: AiTier,
  provider: "local" | "cloud" | undefined,
  attempts: AiRouteAttempt[],
): Promise<{ value: T } | null> {
  try {
    const outcome = await handler(request);
    if (outcome.status === "SERVED") {
      attempts.push({ tier, provider, status: "SERVED" });
      return { value: outcome.value };
    }
    attempts.push({ tier, provider, status: "UNAVAILABLE", detail: outcome.detail });
    return null;
  } catch (error) {
    attempts.push({
      tier,
      provider,
      status: "ERROR",
      detail: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Whether a task could be served at all right now, without running it.
 *
 * For deciding whether to render an "Explain with AI" button — offering an action that is
 * guaranteed to fail is worse than not offering it. Intentionally cheap and conservative: it
 * checks the flag, the language and the declared tiers, not whether a cache row exists.
 */
export function canAttemptTask(
  taskId: AiTaskId,
  languageCode: string,
  capabilities: AiCapabilities,
  flags: AiTaskFlags,
): boolean {
  const task = AI_TASKS[taskId];
  if (flags[taskId] !== true) return false;
  if (!(task.languages as readonly string[]).includes(languageCode)) return false;

  return task.tiers.some((tier) => {
    if (tier !== "GENERATED") return true;
    const localPossible =
      capabilities.localModelReady && meetsDeviceTier(capabilities.deviceTier, task.minDeviceTier);
    const cloudPossible = capabilities.cloudEnabled && capabilities.online;
    return localPossible || cloudPossible;
  });
}

export function isAiLanguageSupportedForTask(
  taskId: AiTaskId,
  languageCode: string,
): languageCode is AiLanguageCode {
  return (AI_TASKS[taskId].languages as readonly string[]).includes(languageCode);
}
