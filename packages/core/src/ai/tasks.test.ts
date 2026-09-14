import { describe, expect, it } from "vitest";

import {
  AI_LANGUAGES,
  AI_TASKS,
  AI_TASK_IDS,
  TIER_ORDER,
  aiTask,
  isAiLanguage,
  isAiTaskId,
  meetsDeviceTier,
  registryViolations,
} from "./tasks";
import type { AiTaskDefinition } from "./tasks";

/**
 * A known-good definition to mutate. Each drift test changes exactly one thing, so a failure
 * names the rule that broke rather than "the registry is wrong somewhere".
 */
function validTask(overrides: Partial<AiTaskDefinition> = {}): AiTaskDefinition {
  return {
    id: "QUESTION_EXPLANATION",
    tiers: ["GROUND_TRUTH", "CACHED", "GENERATED"],
    personalized: false,
    cacheable: true,
    languages: ["en", "hi"],
    requiredContext: ["question"],
    maxOutputTokens: 400,
    minDeviceTier: "MID",
    groundTruthFallback: "AUTHORED_EXPLANATION",
    ...overrides,
  };
}

function violationsFor(overrides: Partial<AiTaskDefinition>): string[] {
  const task = validTask(overrides);
  return registryViolations({ [task.id]: task });
}

describe("the shipped registry", () => {
  it("is internally consistent", () => {
    expect(registryViolations(AI_TASKS)).toEqual([]);
  });

  it("exposes every task by id", () => {
    expect(AI_TASK_IDS.length).toBe(Object.keys(AI_TASKS).length);
    for (const id of AI_TASK_IDS) {
      expect(aiTask(id).id).toBe(id);
    }
  });

  /**
   * Decision 3 in AI_ARCHITECTURE.md §13. Telugu has UI strings but no question content, so a
   * task offering it would be promising an answer that could only come from translating the
   * question first. Asserted here so re-adding it has to be a deliberate act with a failing test
   * to explain.
   */
  it("offers no language that has no question content", () => {
    expect(AI_LANGUAGES).toEqual(["en", "hi"]);
    for (const id of AI_TASK_IDS) {
      for (const language of AI_TASKS[id].languages) {
        expect(isAiLanguage(language)).toBe(true);
      }
    }
    expect(isAiLanguage("te")).toBe(false);
  });

  it("keeps every personalized task out of the cache", () => {
    for (const id of AI_TASK_IDS) {
      const task = AI_TASKS[id];
      if (task.personalized) {
        expect(task.cacheable, `${id} is personalized and must not be cacheable`).toBe(false);
        expect(task.tiers).not.toContain("CACHED");
      }
    }
  });

  it("routes most tasks without a model", () => {
    // Not a style preference — it is the finding the architecture rests on. If this ever fails,
    // someone has started using an LLM for work topicHealth/localRadar already do.
    const needingGeneration = AI_TASK_IDS.filter((id) => AI_TASKS[id].tiers.includes("GENERATED"));
    expect(needingGeneration.length).toBeLessThan(AI_TASK_IDS.length);
  });
});

/**
 * A guard nobody has watched fail is not known to work. These feed `registryViolations` a
 * deliberately broken registry and assert it complains — the same discipline
 * `scripts/check-topic-health-parity.js` was proven with.
 */
describe("registryViolations detects drift", () => {
  it("catches a key that disagrees with its own id", () => {
    const task = validTask();
    expect(registryViolations({ WRONG_KEY: task })[0]).toContain("does not match its own id");
  });

  it("catches a task with no tiers", () => {
    expect(violationsFor({ tiers: [], cacheable: false, maxOutputTokens: 0 })[0]).toContain(
      "has no tiers",
    );
  });

  it("catches tiers listed out of resolution order", () => {
    expect(violationsFor({ tiers: ["CACHED", "GROUND_TRUTH", "GENERATED"] })).toContainEqual(
      expect.stringContaining("must be listed in TIER_ORDER"),
    );
  });

  it("catches a personalized task marked cacheable", () => {
    expect(
      violationsFor({ personalized: true, cacheable: true, requiredContext: ["question", "learner"] }),
    ).toContainEqual(expect.stringContaining("personalized tasks can never be cacheable"));
  });

  it("catches a cacheable task with no CACHED tier", () => {
    expect(violationsFor({ tiers: ["GROUND_TRUTH", "GENERATED"] })).toContainEqual(
      expect.stringContaining("marked cacheable but has no CACHED tier"),
    );
  });

  /**
   * The most dangerous drift available: a shared, cached answer that was built from one
   * student's performance would be generated once and then served to everyone else.
   */
  it("catches a shared task asking for learner context", () => {
    expect(violationsFor({ requiredContext: ["question", "learner"] })).toContainEqual(
      expect.stringContaining("not marked personalized"),
    );
  });

  it("catches a personalized task that asks for no learner-scoped context", () => {
    expect(violationsFor({ personalized: true, cacheable: false, tiers: ["GENERATED"] })).toContainEqual(
      expect.stringContaining("personalized but asks for no learner-scoped context"),
    );
  });

  /**
   * Phase 7: `"session"`/`"learnerProfile"` are exactly as per-student as `"learner"` is, so the
   * personalized-context check must treat all three identically — not just the original kind.
   */
  it("accepts a personalized task scoped by session context instead of learner context", () => {
    expect(
      violationsFor({ personalized: true, cacheable: false, tiers: ["GENERATED"], requiredContext: ["session"] }),
    ).toEqual([]);
  });

  it("accepts a personalized task scoped by learnerProfile context instead of learner context", () => {
    expect(
      violationsFor({
        personalized: true,
        cacheable: false,
        tiers: ["GENERATED"],
        requiredContext: ["learnerProfile"],
      }),
    ).toEqual([]);
  });

  it("catches a shared task asking for session context", () => {
    expect(violationsFor({ requiredContext: ["question", "session"] })).toContainEqual(
      expect.stringContaining("not marked personalized"),
    );
  });

  it("catches a task prompted with no context at all", () => {
    expect(violationsFor({ requiredContext: [] })).toContainEqual(
      expect.stringContaining("requires no context"),
    );
  });

  it("catches a language with no question content", () => {
    expect(violationsFor({ languages: ["en", "te" as "en"] })).toContainEqual(
      expect.stringContaining('language "te" has no question content'),
    );
  });

  it("catches a generating task with no room to answer", () => {
    expect(violationsFor({ maxOutputTokens: 0 })).toContainEqual(
      expect.stringContaining("allows 0 output tokens"),
    );
  });

  it("catches an output budget on a task that never generates", () => {
    expect(
      violationsFor({ tiers: ["GROUND_TRUTH", "CACHED"], maxOutputTokens: 400 }),
    ).toContainEqual(expect.stringContaining("has no GENERATED tier"));
  });

  it("reports a clean registry as clean", () => {
    expect(violationsFor({})).toEqual([]);
  });
});

describe("helpers", () => {
  it("orders tiers cheapest and most trustworthy first", () => {
    expect(TIER_ORDER).toEqual(["GROUND_TRUTH", "DETERMINISTIC", "CACHED", "GENERATED"]);
  });

  it("compares device tiers by capability, not alphabetically", () => {
    expect(meetsDeviceTier("HIGH", "MID")).toBe(true);
    expect(meetsDeviceTier("MID", "MID")).toBe(true);
    expect(meetsDeviceTier("LOW", "MID")).toBe(false);
    // "HIGH" < "LOW" as strings; the ordering must come from the band, not the spelling.
    expect(meetsDeviceTier("HIGH", "LOW")).toBe(true);
  });

  it("recognises only real task ids", () => {
    expect(isAiTaskId("QUESTION_EXPLANATION")).toBe(true);
    expect(isAiTaskId("DEFINITELY_NOT_A_TASK")).toBe(false);
    // Guards against `hasOwnProperty` being satisfied by something inherited from Object.
    expect(isAiTaskId("toString")).toBe(false);
  });
});
