import { describe, expect, it } from "vitest";

import { greetingPeriod, resolveOnboardingStatus, type OnboardingSignals } from "./status";

function signals(overrides: Partial<OnboardingSignals> = {}): OnboardingSignals {
  return {
    completedAt: null,
    startedAt: null,
    hasSyncedBefore: false,
    hasPracticeHistory: false,
    hasFollowedExams: false,
    hasAccount: false,
    ...overrides,
  };
}

describe("a genuinely fresh install", () => {
  it("is asked to onboard", () => {
    expect(resolveOnboardingStatus(signals())).toBe("REQUIRED");
  });
});

describe("an install that has already onboarded", () => {
  it("is never asked again", () => {
    expect(resolveOnboardingStatus(signals({ completedAt: "2026-09-17T09:00:00.000Z" }))).toBe("COMPLETED");
  });

  it("stays complete even once every usage signal is true", () => {
    const result = resolveOnboardingStatus(
      signals({
        completedAt: "2026-09-17T09:00:00.000Z",
        hasSyncedBefore: true,
        hasPracticeHistory: true,
        hasFollowedExams: true,
        hasAccount: true,
      }),
    );
    expect(result).toBe("COMPLETED");
  });
});

/**
 * The §19 case: people who were using the app before onboarding existed. Any single sign of
 * prior use is enough — wrongly re-onboarding them looks like their data was lost, which is a
 * far worse failure than the alternative.
 */
describe("an install that predates onboarding", () => {
  it.each([
    ["it has synced before", { hasSyncedBefore: true }],
    ["it has practice history", { hasPracticeHistory: true }],
    ["it follows an exam", { hasFollowedExams: true }],
    ["it has a signed-in account", { hasAccount: true }],
  ])("is adopted silently when %s", (_label, signal) => {
    expect(resolveOnboardingStatus(signals(signal))).toBe("ADOPT_EXISTING_INSTALL");
  });

  it("is adopted when several signals are true at once", () => {
    const result = resolveOnboardingStatus(
      signals({ hasSyncedBefore: true, hasPracticeHistory: true, hasFollowedExams: true }),
    );
    expect(result).toBe("ADOPT_EXISTING_INSTALL");
  });
});

/**
 * The bug this ordering exists to prevent, and the reason `startedAt` is stored at all.
 *
 * Onboarding runs *while* the first sync is in flight. By the time a student reaches step 3,
 * that sync has usually completed and `ensureExamFollowed` has followed an exam — so on the
 * next launch the usage signals look exactly like an existing install. Without the stamp, a
 * student who killed the app mid-flow would be adopted and never asked for their name again.
 */
describe("onboarding interrupted halfway", () => {
  it("is still required after a restart, even though the first sync has since completed", () => {
    const result = resolveOnboardingStatus(
      signals({
        startedAt: "2026-09-17T09:00:00.000Z",
        hasSyncedBefore: true,
        hasFollowedExams: true,
      }),
    );
    expect(result).toBe("REQUIRED");
  });

  it("is required after a restart even with no other signal", () => {
    expect(resolveOnboardingStatus(signals({ startedAt: "2026-09-17T09:00:00.000Z" }))).toBe("REQUIRED");
  });

  it("yields to a completion stamp, which always wins", () => {
    const result = resolveOnboardingStatus(
      signals({ startedAt: "2026-09-17T09:00:00.000Z", completedAt: "2026-09-17T09:02:00.000Z" }),
    );
    expect(result).toBe("COMPLETED");
  });
});

describe("greeting period", () => {
  it.each([
    [5, "morning"],
    [9, "morning"],
    [11, "morning"],
    [12, "afternoon"],
    [16, "afternoon"],
    [17, "evening"],
    [23, "evening"],
    [0, "evening"],
    [4, "evening"],
  ])("hour %i is %s", (hour, expected) => {
    expect(greetingPeriod(hour)).toBe(expected);
  });

  it("covers every hour of the day", () => {
    for (let hour = 0; hour < 24; hour++) {
      expect(["morning", "afternoon", "evening"]).toContain(greetingPeriod(hour));
    }
  });
});
