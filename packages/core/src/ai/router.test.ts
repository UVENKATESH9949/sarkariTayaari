import { describe, expect, it, vi } from "vitest";

import { buildLearnerContext, buildQuestionContext } from "./context/build";
import type { AiContext } from "./context/types";
import type { RadarTopic } from "../intelligence/types";
import { canAttemptTask, routeAiTask } from "./router";
import type { AiCapabilities, AiRouteRequest, AiTaskFlags, AiTierHandlers } from "./router";

const QUESTION = buildQuestionContext({
  questionId: "q-1",
  questionType: "SINGLE_CHOICE",
  languageCode: "en",
  questionText: "What is the capital of West Bengal?",
  options: ["Mumbai", "Kolkata"],
  correctAnswer: "Kolkata",
  subjectName: "General Awareness",
  topicName: "Indian States",
  difficultyCode: "EASY",
});

const RADAR_TOPIC = {
  reasonCodes: ["LOW_ACCURACY"],
  state: "NEEDS_ATTENTION",
  healthScore: 40,
  recentAccuracyPercent: 42,
  evidenceLevel: "RELIABLE",
  attemptedCount: 30,
} as unknown as RadarTopic;

const LEARNER = buildLearnerContext(RADAR_TOPIC, { examCode: "SSC_CGL", preferredLanguage: "en" });

const CAPABLE: AiCapabilities = {
  deviceTier: "HIGH",
  online: true,
  localModelReady: true,
  cloudEnabled: true,
};

const ALL_ON: AiTaskFlags = {
  QUESTION_EXPLANATION: true,
  QUESTION_HINT: true,
  MISTAKE_ANALYSIS: true,
  PERSONALIZED_EXPLANATION: true,
};

function request(overrides: Partial<AiRouteRequest> = {}): AiRouteRequest {
  return {
    taskId: "QUESTION_EXPLANATION",
    languageCode: "en",
    context: { question: QUESTION } as AiContext,
    capabilities: CAPABLE,
    flags: ALL_ON,
    ...overrides,
  };
}

const serves = (value: string) => vi.fn(async () => ({ status: "SERVED" as const, value }));
const declines = () => vi.fn(async () => ({ status: "UNAVAILABLE" as const, detail: "nothing here" }));

describe("tier order", () => {
  it("prefers ground truth over everything", async () => {
    const handlers: AiTierHandlers<string> = {
      groundTruth: serves("authored"),
      cached: serves("cached"),
      cloud: serves("cloud"),
    };

    const result = await routeAiTask(request(), handlers);

    expect(result.status).toBe("SERVED");
    if (result.status === "SERVED") {
      expect(result.tier).toBe("GROUND_TRUTH");
      expect(result.value).toBe("authored");
    }
    expect(handlers.cached).not.toHaveBeenCalled();
    expect(handlers.cloud).not.toHaveBeenCalled();
  });

  it("falls to the cache when ground truth declines", async () => {
    const cloud = serves("cloud");
    const result = await routeAiTask(request(), {
      groundTruth: declines(),
      cached: serves("cached"),
      cloud,
    });

    expect(result.status).toBe("SERVED");
    if (result.status === "SERVED") expect(result.tier).toBe("CACHED");
    expect(cloud).not.toHaveBeenCalled();
  });

  /**
   * Local before cloud even when both are available — it is free, private and needs no round
   * trip. Framing this as "offline? then local" gets it backwards and quietly bills for work the
   * device could have done itself.
   */
  it("tries the local model before the cloud when both are available", async () => {
    const local = serves("local");
    const cloud = serves("cloud");

    const result = await routeAiTask(request(), { groundTruth: declines(), cached: declines(), local, cloud });

    expect(result.status).toBe("SERVED");
    if (result.status === "SERVED") {
      expect(result.tier).toBe("GENERATED");
      expect(result.provider).toBe("local");
    }
    expect(cloud).not.toHaveBeenCalled();
  });

  it("escalates to cloud when the local model declines", async () => {
    const result = await routeAiTask(request(), {
      groundTruth: declines(),
      cached: declines(),
      local: declines(),
      cloud: serves("cloud"),
    });

    expect(result.status).toBe("SERVED");
    if (result.status === "SERVED") expect(result.provider).toBe("cloud");
  });
});

describe("capability gating", () => {
  it("skips the local model on a device below the task's bar", async () => {
    const local = serves("local");
    const result = await routeAiTask(
      request({ capabilities: { ...CAPABLE, deviceTier: "LOW" } }),
      { groundTruth: declines(), cached: declines(), local, cloud: serves("cloud") },
    );

    expect(local).not.toHaveBeenCalled();
    if (result.status === "SERVED") expect(result.provider).toBe("cloud");
    expect(result.attempts).toContainEqual(
      expect.objectContaining({ provider: "local", status: "SKIPPED", detail: expect.stringContaining("LOW") }),
    );
  });

  it("skips the local model when none is installed", async () => {
    const local = serves("local");
    await routeAiTask(request({ capabilities: { ...CAPABLE, localModelReady: false } }), {
      groundTruth: declines(),
      cached: declines(),
      local,
      cloud: serves("cloud"),
    });
    expect(local).not.toHaveBeenCalled();
  });

  it("does not reach for the cloud while offline", async () => {
    const cloud = serves("cloud");
    const result = await routeAiTask(
      request({ capabilities: { ...CAPABLE, online: false, localModelReady: false } }),
      { groundTruth: declines(), cached: declines(), cloud },
    );

    expect(cloud).not.toHaveBeenCalled();
    expect(result.status).toBe("UNAVAILABLE");
    if (result.status === "UNAVAILABLE") expect(result.reason).toBe("ALL_TIERS_DECLINED");
  });

  it("honours the cloud kill switch even when online", async () => {
    const cloud = serves("cloud");
    await routeAiTask(
      request({ capabilities: { ...CAPABLE, cloudEnabled: false, localModelReady: false } }),
      { groundTruth: declines(), cached: declines(), cloud },
    );
    expect(cloud).not.toHaveBeenCalled();
  });
});

describe("refusals", () => {
  /** Unknown means off, so a config that failed to load can never dark-launch a feature. */
  it("treats an absent flag as disabled", async () => {
    const result = await routeAiTask(request({ flags: {} }), { groundTruth: serves("authored") });

    expect(result.status).toBe("UNAVAILABLE");
    if (result.status === "UNAVAILABLE") expect(result.reason).toBe("TASK_DISABLED");
  });

  it("treats an explicitly disabled flag as disabled", async () => {
    const groundTruth = serves("authored");
    await routeAiTask(request({ flags: { QUESTION_EXPLANATION: false } }), { groundTruth });
    expect(groundTruth).not.toHaveBeenCalled();
  });

  /**
   * Decision 3: refuse rather than answer in another language. Silently serving English to a
   * Hindi request is a worse failure than serving nothing, and translating the question first is
   * exactly the fabrication this architecture exists to prevent.
   */
  it("refuses a language the task has no content for", async () => {
    const groundTruth = serves("authored");
    const result = await routeAiTask(request({ languageCode: "te" }), { groundTruth });

    expect(result.status).toBe("UNAVAILABLE");
    if (result.status === "UNAVAILABLE") {
      expect(result.reason).toBe("LANGUAGE_NOT_SUPPORTED");
      expect(result.detail).toContain("te");
    }
    expect(groundTruth).not.toHaveBeenCalled();
  });

  it("refuses when required context is missing", async () => {
    const result = await routeAiTask(request({ context: {} }), { groundTruth: serves("authored") });

    expect(result.status).toBe("UNAVAILABLE");
    if (result.status === "UNAVAILABLE") {
      expect(result.reason).toBe("MISSING_CONTEXT");
      expect(result.detail).toContain("question");
    }
  });

  it("reports the task's fallback so the UI knows what to show instead", async () => {
    const result = await routeAiTask(request({ flags: {} }), {});
    if (result.status === "UNAVAILABLE") expect(result.fallback).toBe("AUTHORED_EXPLANATION");
  });
});

describe("failures fall through and never propagate", () => {
  it("continues past a handler that throws", async () => {
    const result = await routeAiTask(request(), {
      groundTruth: vi.fn(async () => {
        throw new Error("local database is locked");
      }),
      cached: serves("cached"),
    });

    expect(result.status).toBe("SERVED");
    if (result.status === "SERVED") expect(result.tier).toBe("CACHED");
    expect(result.attempts).toContainEqual(
      expect.objectContaining({ tier: "GROUND_TRUTH", status: "ERROR", detail: "local database is locked" }),
    );
  });

  it("survives every handler throwing", async () => {
    const boom = vi.fn(async () => {
      throw new Error("boom");
    });

    const result = await routeAiTask(request(), { groundTruth: boom, cached: boom, local: boom, cloud: boom });

    expect(result.status).toBe("UNAVAILABLE");
    if (result.status === "UNAVAILABLE") expect(result.reason).toBe("ALL_TIERS_DECLINED");
  });

  it("records a skip for each tier with no handler", async () => {
    const result = await routeAiTask(request(), {});

    expect(result.status).toBe("UNAVAILABLE");
    expect(result.attempts.every((attempt) => attempt.status === "SKIPPED")).toBe(true);
  });

  it("keeps an ordered trail of what was tried", async () => {
    const result = await routeAiTask(request(), {
      groundTruth: declines(),
      cached: declines(),
      local: declines(),
      cloud: serves("cloud"),
    });

    expect(result.attempts.map((a) => `${a.tier}:${a.provider ?? "-"}:${a.status}`)).toEqual([
      "GROUND_TRUTH:-:UNAVAILABLE",
      "CACHED:-:UNAVAILABLE",
      "GENERATED:local:UNAVAILABLE",
      "GENERATED:cloud:SERVED",
    ]);
  });
});

describe("deterministic-only tasks", () => {
  it("never reaches a model", async () => {
    const cloud = serves("cloud");
    const result = await routeAiTask(
      {
        taskId: "STUDY_PLAN",
        languageCode: "en",
        context: { learner: LEARNER, exam: { examCode: "SSC_CGL", examName: "SSC CGL", topicPriority: null, weightagePercent: null } },
        capabilities: CAPABLE,
        flags: { STUDY_PLAN: true },
      },
      { deterministic: serves("plan"), cloud },
    );

    expect(result.status).toBe("SERVED");
    if (result.status === "SERVED") expect(result.tier).toBe("DETERMINISTIC");
    expect(cloud).not.toHaveBeenCalled();
  });
});

describe("canAttemptTask", () => {
  it("is false for a disabled task", () => {
    expect(canAttemptTask("QUESTION_EXPLANATION", "en", CAPABLE, {})).toBe(false);
  });

  it("is false for an unsupported language", () => {
    expect(canAttemptTask("QUESTION_EXPLANATION", "te", CAPABLE, ALL_ON)).toBe(false);
  });

  it("is true for a task with a non-generating tier, whatever the device", () => {
    // The point of putting the flagship feature in CACHED: a 3 GB phone with no network can
    // still be offered it.
    const offlineLowEnd: AiCapabilities = {
      deviceTier: "LOW",
      online: false,
      localModelReady: false,
      cloudEnabled: false,
    };
    expect(canAttemptTask("QUESTION_EXPLANATION", "en", offlineLowEnd, ALL_ON)).toBe(true);
  });

  it("is false for a generate-only task with no way to generate", () => {
    const offlineLowEnd: AiCapabilities = {
      deviceTier: "LOW",
      online: false,
      localModelReady: false,
      cloudEnabled: false,
    };
    expect(canAttemptTask("PERSONALIZED_EXPLANATION", "en", offlineLowEnd, ALL_ON)).toBe(false);
  });

  it("is true for a generate-only task once the cloud is reachable", () => {
    expect(canAttemptTask("PERSONALIZED_EXPLANATION", "en", CAPABLE, ALL_ON)).toBe(true);
  });
});
